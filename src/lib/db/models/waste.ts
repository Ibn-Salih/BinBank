export type UserRole = 'WASTE_CREATOR' | 'WASTE_COLLECTOR' | 'RECYCLING_COMPANY';

export interface UserNode {
  id: string;
  telegramId: number;
  name: string;
  contact: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  role: UserRole;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WastePickupRequest {
  id: string;
  wasteCreatorId: string;
  status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  expiresAt: string;
  assignedCollectorId?: string;
  verificationPhoto?: string;
  weight?: number;
  recyclingCompanyId?: string;
}

export interface WasteExchange {
  id: string;
  pickupRequestId: string;
  wasteCreatorId: string;
  wasteCollectorId: string;
  recyclingCompanyId?: string;
  status: 'CREATOR_TO_COLLECTOR' | 'COLLECTOR_TO_RECYCLER' | 'COMPLETED';
  verificationPhoto?: string;
  weight?: number;
  createdAt: string;
  completedAt?: string;
} 