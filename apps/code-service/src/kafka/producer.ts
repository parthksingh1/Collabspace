import { Kafka, Producer, Message } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';

class KafkaProducer {
  private static instance: KafkaProducer;
  private producer: Producer;
  private connected = false;

  private constructor() {
    const kafka = new Kafka({
      clientId: 'code-service',
      brokers: config.kafkaBrokers,
    });
    this.producer = kafka.producer();
  }

  static getInstance(): KafkaProducer {
    if (!KafkaProducer.instance) {
      KafkaProducer.instance = new KafkaProducer();
    }
    return KafkaProducer.instance;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
    logger.info('Kafka producer connected');
  }

  async publish(topic: string, messages: Message[]): Promise<void> {
    if (!this.connected) {
      logger.warn('Kafka producer not connected, skipping publish');
      return;
    }
    await this.producer.send({ topic, messages });
  }

  async publishCodeEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish('code.events', [
      {
        key: payload.fileId as string || payload.executionId as string || '',
        value: JSON.stringify({ type: eventType, payload, timestamp: Date.now() }),
      },
    ]);
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    this.connected = false;
  }
}

export { KafkaProducer };
