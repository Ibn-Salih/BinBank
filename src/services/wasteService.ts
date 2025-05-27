import { initDriver } from '../lib/db/neo4j';
import { WastePickupRequest, WasteExchange } from '../lib/db/models/waste';
import { logger } from '../lib/logger';

export async function createPickupRequest(wasteCreatorId: string): Promise<WastePickupRequest> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (creator:User {id: $wasteCreatorId})
      CREATE (request:WastePickupRequest {
        id: randomUUID(),
        wasteCreatorId: $wasteCreatorId,
        status: 'PENDING',
        createdAt: datetime(),
        expiresAt: datetime() + duration({hours: 5})
      })
      CREATE (creator)-[:CREATED]->(request)
      RETURN request
      `,
      { wasteCreatorId }
    );

    return result.records[0].get('request').properties as WastePickupRequest;
  } catch (error) {
    logger.error('Failed to create pickup request:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function assignCollectorToRequest(
  requestId: string,
  collectorId: string
): Promise<WastePickupRequest> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (request:WastePickupRequest {id: $requestId})
      MATCH (collector:User {id: $collectorId})
      SET request.status = 'ACCEPTED',
          request.assignedCollectorId = $collectorId
      CREATE (collector)-[:ASSIGNED_TO]->(request)
      RETURN request
      `,
      { requestId, collectorId }
    );

    return result.records[0].get('request').properties as WastePickupRequest;
  } catch (error) {
    logger.error('Failed to assign collector:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function createWasteExchange(
  pickupRequestId: string,
  wasteCreatorId: string,
  wasteCollectorId: string
): Promise<WasteExchange> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (request:WastePickupRequest {id: $pickupRequestId})
      MATCH (creator:User {id: $wasteCreatorId})
      MATCH (collector:User {id: $wasteCollectorId})
      CREATE (exchange:WasteExchange {
        id: randomUUID(),
        pickupRequestId: $pickupRequestId,
        wasteCreatorId: $wasteCreatorId,
        wasteCollectorId: $wasteCollectorId,
        status: 'CREATOR_TO_COLLECTOR',
        createdAt: datetime()
      })
      CREATE (request)-[:HAS_EXCHANGE]->(exchange)
      CREATE (creator)-[:PARTICIPATED_IN]->(exchange)
      CREATE (collector)-[:PARTICIPATED_IN]->(exchange)
      RETURN exchange
      `,
      { pickupRequestId, wasteCreatorId, wasteCollectorId }
    );

    return result.records[0].get('exchange').properties as WasteExchange;
  } catch (error) {
    logger.error('Failed to create waste exchange:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function updateExchangeWithVerification(
  exchangeId: string,
  verificationPhoto: string
): Promise<WasteExchange> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (exchange:WasteExchange {id: $exchangeId})
      SET exchange.verificationPhoto = $verificationPhoto
      RETURN exchange
      `,
      { exchangeId, verificationPhoto }
    );

    return result.records[0].get('exchange').properties as WasteExchange;
  } catch (error) {
    logger.error('Failed to update exchange verification:', error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function completeExchange(
  exchangeId: string,
  recyclingCompanyId: string,
  weight: number
): Promise<WasteExchange> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (exchange:WasteExchange {id: $exchangeId})
      MATCH (company:User {id: $recyclingCompanyId})
      SET exchange.status = 'COMPLETED',
          exchange.recyclingCompanyId = $recyclingCompanyId,
          exchange.weight = $weight,
          exchange.completedAt = datetime()
      CREATE (company)-[:PARTICIPATED_IN]->(exchange)
      RETURN exchange
      `,
      { exchangeId, recyclingCompanyId, weight }
    );

    return result.records[0].get('exchange').properties as WasteExchange;
  } catch (error) {
    logger.error('Failed to complete exchange:', error);
    throw error;
  } finally {
    await session.close();
  }
} 