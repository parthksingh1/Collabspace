import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';

class KafkaCodeConsumer {
  private consumer: Consumer;

  constructor() {
    const kafka = new Kafka({
      clientId: 'code-service',
      brokers: config.kafkaBrokers,
    });
    this.consumer = kafka.consumer({ groupId: 'code-service-consumer' });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'code.events', fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        try {
          if (!message.value) return;
          const event = JSON.parse(message.value.toString());

          switch (event.type) {
            case 'file_updated':
              // Persist CRDT update from WebSocket gateway
              logger.debug('Code file CRDT update', { fileId: event.payload?.fileId });
              break;

            case 'execution_completed':
              // Handle execution result notifications
              logger.debug('Execution completed', { executionId: event.payload?.executionId });
              break;

            case 'room_started':
              logger.info('Coding room started', { roomId: event.payload?.roomId });
              break;

            default:
              logger.debug('Unhandled code event', { type: event.type });
          }
        } catch (error) {
          logger.error('Failed to process code event', { error: (error as Error).message });
        }
      },
    });

    logger.info('Kafka code consumer started');
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}

export { KafkaCodeConsumer };
