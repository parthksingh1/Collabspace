import type { AuthenticatedSocket } from '../connection-manager.js';
import { RoomManager } from '../room-manager.js';
import { logger } from '../utils/logger.js';
import { messagesReceived, messagesSent } from '../metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskUpdate {
  type: 'project:task:update';
  projectId: string;
  taskId: string;
  changes: Record<string, unknown>;
}

interface TaskCreate {
  type: 'project:task:create';
  projectId: string;
  task: {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    assigneeId?: string;
    columnId: string;
    order: number;
  };
}

interface TaskDelete {
  type: 'project:task:delete';
  projectId: string;
  taskId: string;
}

interface KanbanColumnMove {
  type: 'project:kanban:move';
  projectId: string;
  taskId: string;
  fromColumnId: string;
  toColumnId: string;
  newOrder: number;
}

interface KanbanColumnReorder {
  type: 'project:kanban:reorder';
  projectId: string;
  columnId: string;
  taskOrders: Array<{ taskId: string; order: number }>;
}

interface SprintTimerSync {
  type: 'project:sprint:timer';
  projectId: string;
  sprintId: string;
  action: 'start' | 'pause' | 'resume' | 'stop' | 'sync';
  remainingMs?: number;
  endsAt?: string;
}

interface ProjectPresence {
  type: 'project:presence';
  projectId: string;
  viewingTaskId?: string;
  editingField?: string;
}

type ProjectMessage =
  | TaskUpdate
  | TaskCreate
  | TaskDelete
  | KanbanColumnMove
  | KanbanColumnReorder
  | SprintTimerSync
  | ProjectPresence;

// ── Kafka placeholder ─────────────────────────────────────────────────────────

let kafkaProducer: { send(topic: string, messages: Array<{ key: string; value: string }>): Promise<void> } | null = null;

export function setKafkaProducer(producer: typeof kafkaProducer): void {
  kafkaProducer = producer;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleProjectMessage(
  socket: AuthenticatedSocket,
  message: ProjectMessage,
): Promise<void> {
  const { userId, socketId } = socket.meta;
  const roomManager = RoomManager.getInstance();

  messagesReceived.labels(message.type, 'project').inc();

  switch (message.type) {
    case 'project:task:create': {
      const { projectId, task } = message;
      const roomId = `project:${projectId}`;

      logger.debug('Task created', { userId, projectId, taskId: task.id });

      const response = JSON.stringify({
        type: 'project:task:create',
        projectId,
        task,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('project:task:create', 'project').inc();

      await persistProjectChange(projectId, userId, 'task:create', { task });
      break;
    }

    case 'project:task:update': {
      const { projectId, taskId, changes } = message;
      const roomId = `project:${projectId}`;

      logger.debug('Task updated', { userId, projectId, taskId, fields: Object.keys(changes) });

      const response = JSON.stringify({
        type: 'project:task:update',
        projectId,
        taskId,
        changes,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('project:task:update', 'project').inc();

      await persistProjectChange(projectId, userId, 'task:update', { taskId, changes });
      break;
    }

    case 'project:task:delete': {
      const { projectId, taskId } = message;
      const roomId = `project:${projectId}`;

      logger.debug('Task deleted', { userId, projectId, taskId });

      const response = JSON.stringify({
        type: 'project:task:delete',
        projectId,
        taskId,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('project:task:delete', 'project').inc();

      await persistProjectChange(projectId, userId, 'task:delete', { taskId });
      break;
    }

    case 'project:kanban:move': {
      const { projectId, taskId, fromColumnId, toColumnId, newOrder } = message;
      const roomId = `project:${projectId}`;

      logger.debug('Kanban card moved', { userId, projectId, taskId, from: fromColumnId, to: toColumnId });

      const response = JSON.stringify({
        type: 'project:kanban:move',
        projectId,
        taskId,
        fromColumnId,
        toColumnId,
        newOrder,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('project:kanban:move', 'project').inc();

      await persistProjectChange(projectId, userId, 'kanban:move', {
        taskId,
        fromColumnId,
        toColumnId,
        newOrder,
      });
      break;
    }

    case 'project:kanban:reorder': {
      const { projectId, columnId, taskOrders } = message;
      const roomId = `project:${projectId}`;

      logger.debug('Kanban column reordered', { userId, projectId, columnId, count: taskOrders.length });

      const response = JSON.stringify({
        type: 'project:kanban:reorder',
        projectId,
        columnId,
        taskOrders,
        userId,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('project:kanban:reorder', 'project').inc();

      await persistProjectChange(projectId, userId, 'kanban:reorder', { columnId, taskOrders });
      break;
    }

    case 'project:sprint:timer': {
      const { projectId, sprintId, action, remainingMs, endsAt } = message;
      const roomId = `project:${projectId}`;

      logger.info('Sprint timer action', { userId, projectId, sprintId, action });

      const response = JSON.stringify({
        type: 'project:sprint:timer',
        projectId,
        sprintId,
        action,
        remainingMs,
        endsAt,
        userId,
        timestamp: new Date().toISOString(),
      });

      // Broadcast to ALL members including sender for timer sync consistency
      roomManager.broadcastToRoom(roomId, response);
      messagesSent.labels('project:sprint:timer', 'project').inc();

      if (action !== 'sync') {
        await persistProjectChange(projectId, userId, 'sprint:timer', { sprintId, action, remainingMs, endsAt });
      }
      break;
    }

    case 'project:presence': {
      const { projectId, viewingTaskId, editingField } = message;
      const roomId = `project:${projectId}`;

      const response = JSON.stringify({
        type: 'project:presence',
        projectId,
        userId,
        viewingTaskId,
        editingField,
        timestamp: new Date().toISOString(),
      });

      roomManager.broadcastToRoom(roomId, response, socketId);
      messagesSent.labels('project:presence', 'project').inc();
      break;
    }

    default: {
      logger.warn('Unknown project message type', { type: (message as { type: string }).type, userId });
    }
  }
}

// ── Kafka persistence ─────────────────────────────────────────────────────────

async function persistProjectChange(
  projectId: string,
  userId: string,
  operation: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!kafkaProducer) {
    logger.debug('Kafka producer not available, skipping project persistence', { projectId });
    return;
  }

  try {
    await kafkaProducer.send('project-updates', [
      {
        key: projectId,
        value: JSON.stringify({
          projectId,
          userId,
          operation,
          data,
          timestamp: new Date().toISOString(),
        }),
      },
    ]);
  } catch (err) {
    logger.error('Failed to publish project update to Kafka', {
      projectId,
      userId,
      error: (err as Error).message,
    });
  }
}
