import { initDriver } from '../lib/db/neo4j';
import { UserNode, UserRole } from '../lib/db/models/waste';
import { logger } from '../lib/logger';

export async function registerUser(
  telegramId: number,
  name: string,
  contact: string,
  location: { latitude: number; longitude: number; address: string },
  role: UserRole
): Promise<UserNode> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MERGE (u:User {telegramId: $telegramId})
      ON CREATE SET 
        u.id = randomUUID(),
        u.name = $name,
        u.contact = $contact,
        u.location = $location,
        u.role = $role,
        u.isOnline = true,
        u.createdAt = datetime(),
        u.updatedAt = datetime()
      ON MATCH SET
        u.name = $name,
        u.contact = $contact,
        u.location = $location,
        u.role = $role,
        u.updatedAt = datetime()
      RETURN u
      `,
      {
        telegramId,
        name,
        contact,
        location,
        role,
      }
    );

    const user = result.records[0].get('u').properties;
    return user as UserNode;
  } catch (error) {
    logger.error('Failed to register user:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function getUserByTelegramId(telegramId: number): Promise<UserNode | null> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (u:User {telegramId: $telegramId})
      RETURN u
      `,
      { telegramId }
    );

    if (result.records.length === 0) {
      return null;
    }

    return result.records[0].get('u').properties as UserNode;
  } catch (error) {
    logger.error('Failed to get user:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function updateUserOnlineStatus(telegramId: number, isOnline: boolean): Promise<void> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    await session.run(
      `
      MATCH (u:User {telegramId: $telegramId})
      SET u.isOnline = $isOnline,
          u.updatedAt = datetime()
      `,
      { telegramId, isOnline }
    );
  } catch (error) {
    logger.error('Failed to update user online status:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function getOnlineCollectors(): Promise<UserNode[]> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (u:User)
      WHERE u.role = 'WASTE_COLLECTOR' AND u.isOnline = true
      RETURN u
      `
    );

    return result.records.map(record => record.get('u').properties as UserNode);
  } catch (error) {
    logger.error('Failed to get online collectors:', error);
    throw error;
  } finally {
    await session.close();
  }
} 