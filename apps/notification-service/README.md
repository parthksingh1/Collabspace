# Notification Service

Multi-channel notification system for CollabSpace with real-time delivery and Kafka event processing.

## Port
`4007`

## Responsibilities
- Notification CRUD with read/unread tracking
- **Multi-channel dispatch**: in-app, email (SMTP), push notifications
- **Kafka consumer**: Maps events from all services to notifications
- **Deduplication**: 60-second window prevents duplicate notifications
- **Batching**: Groups similar notifications (e.g., "5 people commented")
- **Quiet hours**: Respects user preferences for email timing
- **Real-time delivery**: Redis pub/sub to WebSocket gateway
- User notification preferences per channel and type
- Unread count caching in Redis

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /notifications | List (paginated, filterable) |
| GET | /notifications/unread-count | Get unread count |
| PUT | /notifications/:id/read | Mark as read |
| PUT | /notifications/read-all | Mark all as read |
| DELETE | /notifications/:id | Delete notification |
| PUT | /notifications/preferences | Update preferences |

## Notification Types
- `comment` — New comment on document/task
- `mention` — @mentioned in content
- `assignment` — Task assigned to user
- `status_change` — Task/sprint status changed
- `invitation` — Workspace invitation
- `ai_suggestion` — AI agent suggestion
- `system` — Platform announcements

## Event-to-Notification Mapping
The Kafka consumer subscribes to all service event topics and maps events:

| Service Event | Notification Type | Recipients |
|--------------|-------------------|------------|
| `document.comment_added` | comment | Document collaborators |
| `document.mention` | mention | Mentioned users |
| `project.task_assigned` | assignment | Assignee |
| `project.task_status_changed` | status_change | Assignee + reporter |
| `project.sprint_completed` | status_change | All project members |
| `ai.suggestion_generated` | ai_suggestion | Target user |

## Email Templates
- Welcome email (registration)
- Password reset
- Comment notification
- Task assignment
- Mention notification
- Sprint status
All emails use responsive HTML with inline styles for email client compatibility.
