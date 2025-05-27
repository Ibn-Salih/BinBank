import { TelegramMessage, sendTelegramMessage } from '../lib/telegram';
import { UserRole, UserNode } from '../lib/db/models/waste';
import { registerUser, getUserByTelegramId, updateUserOnlineStatus, getOnlineCollectors } from './userService';
import { createPickupRequest, assignCollectorToRequest, createWasteExchange, updateExchangeWithVerification, completeExchange } from './wasteService';
import { logger } from '../lib/logger';

interface UserState {
  step: 'REGISTRATION' | 'ROLE_SELECTION' | 'NAME_INPUT' | 'CONTACT_INPUT' | 'LOCATION_INPUT' | 'MAIN_MENU' | 'WAITING_COLLECTOR' | 'WAITING_VERIFICATION' | 'WAITING_WEIGHT';
  role?: UserRole;
  name?: string;
  contact?: string;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  currentRequestId?: string;
  currentExchangeId?: string;
}

const userStates = new Map<number, UserState>();

export async function handleMessage(message: TelegramMessage): Promise<void> {
  if (!message.message?.from?.id || !message.message.chat?.id) {
    return;
  }

  const userId = message.message.from.id;
  const chatId = message.message.chat.id;
  const text = message.message.text || '';

  // Get or initialize user state
  let state = userStates.get(userId) || { step: 'REGISTRATION' };
  const user = await getUserByTelegramId(userId);

  // Handle registration flow
  if (!user) {
    if (state.step === 'REGISTRATION') {
      await sendTelegramMessage(chatId, 'Welcome to Recycle Bin! Please select your role:\n1. Waste Creator\n2. Waste Collector\n3. Recycling Company');
      state.step = 'ROLE_SELECTION';
      userStates.set(userId, state);
      return;
    }

    if (state.step === 'ROLE_SELECTION') {
      const roleMap: { [key: string]: UserRole } = {
        '1': 'WASTE_CREATOR',
        '2': 'WASTE_COLLECTOR',
        '3': 'RECYCLING_COMPANY'
      };

      const role = roleMap[text];
      if (!role) {
        await sendTelegramMessage(chatId, 'Please select a valid role (1, 2, or 3)');
        return;
      }

      state.role = role;
      state.step = 'NAME_INPUT';
      userStates.set(userId, state);
      await sendTelegramMessage(chatId, 'Please enter your name:');
      return;
    }

    if (state.step === 'NAME_INPUT') {
      state.name = text;
      state.step = 'CONTACT_INPUT';
      userStates.set(userId, state);
      await sendTelegramMessage(chatId, 'Please enter your contact number:');
      return;
    }

    if (state.step === 'CONTACT_INPUT') {
      state.contact = text;
      state.step = 'LOCATION_INPUT';
      userStates.set(userId, state);
      await sendTelegramMessage(chatId, 'Please share your location:');
      return;
    }

    if (state.step === 'LOCATION_INPUT' && message.message.location) {
      const { latitude, longitude } = message.message.location;
      state.location = {
        latitude,
        longitude,
        address: 'Location shared' // In a real app, you'd want to reverse geocode this
      };

      try {
        await registerUser(
          userId,
          state.name!,
          state.contact!,
          state.location,
          state.role!
        );

        await sendTelegramMessage(chatId, 'Registration complete! You can now use the bot.');
        state.step = 'MAIN_MENU';
        userStates.set(userId, state);
      } catch (error) {
        logger.error('Registration failed:', error);
        await sendTelegramMessage(chatId, 'Registration failed. Please try again.');
        state.step = 'REGISTRATION';
        userStates.set(userId, state);
      }
      return;
    }
  }

  // Handle main menu and role-specific flows
  if (user) {
    if (state.step === 'MAIN_MENU') {
      if (user.role === 'WASTE_CREATOR') {
        await sendTelegramMessage(chatId, 'Do you want your waste picked up? (yes/no)');
        state.step = 'WAITING_COLLECTOR';
        userStates.set(userId, state);
        return;
      }

      if (user.role === 'WASTE_COLLECTOR') {
        await updateUserOnlineStatus(userId, true);
        await sendTelegramMessage(chatId, 'You are now online and ready to receive pickup requests.');
        return;
      }

      if (user.role === 'RECYCLING_COMPANY') {
        await sendTelegramMessage(chatId, 'You are registered as a recycling company. You will be notified when waste is ready for recycling.');
        return;
      }
    }

    if (state.step === 'WAITING_COLLECTOR' && user.role === 'WASTE_CREATOR') {
      if (text.toLowerCase() === 'yes') {
        const collectors = await getOnlineCollectors();
        if (collectors.length === 0) {
          await sendTelegramMessage(chatId, 'No waste collectors are currently available. You will be notified when one becomes available.');
          return;
        }

        const request = await createPickupRequest(user.id);
        state.currentRequestId = request.id;
        userStates.set(userId, state);

        // Notify all online collectors
        for (const collector of collectors) {
          await sendTelegramMessage(
            collector.telegramId,
            `New waste pickup request from ${user.name} at ${user.location.address}. Are you available? (yes/no)`
          );
        }

        await sendTelegramMessage(chatId, 'Your request has been sent to available collectors. Please wait for a response.');
        return;
      }

      if (text.toLowerCase() === 'no') {
        await sendTelegramMessage(chatId, 'No problem! Let me know when you need waste pickup.');
        state.step = 'MAIN_MENU';
        userStates.set(userId, state);
        return;
      }
    }

    if (user.role === 'WASTE_COLLECTOR' && text.toLowerCase() === 'yes') {
      // Handle collector accepting request
      const request = await assignCollectorToRequest(state.currentRequestId!, user.id);
      const exchange = await createWasteExchange(request.id, request.wasteCreatorId, user.id);
      state.currentExchangeId = exchange.id;
      userStates.set(userId, state);

      await sendTelegramMessage(
        chatId,
        `You have 5 hours to pick up the waste. Location: ${user.location.address}. Type 'arrived' when you reach the location.`
      );
      return;
    }

    if (user.role === 'WASTE_COLLECTOR' && text.toLowerCase() === 'arrived') {
      const creator = await getUserByTelegramId(Number(state.currentRequestId));
      if (creator) {
        await sendTelegramMessage(chatId, `Contact the waste creator at: ${creator.contact}`);
        await sendTelegramMessage(
          creator.telegramId,
          'The waste collector has arrived. Please provide the waste for verification.'
        );
        state.step = 'WAITING_VERIFICATION';
        userStates.set(userId, state);
      }
      return;
    }

    if (state.step === 'WAITING_VERIFICATION' && message.message.photo) {
      // Handle photo verification
      const photoId = message.message.photo[0].file_id;
      await updateExchangeWithVerification(state.currentExchangeId!, photoId);
      await sendTelegramMessage(chatId, 'Verification photo received. Please proceed with the waste collection.');
      state.step = 'WAITING_WEIGHT';
      userStates.set(userId, state);
      return;
    }

    if (state.step === 'WAITING_WEIGHT' && !isNaN(Number(text))) {
      // Handle weight input from recycling company
      const weight = Number(text);
      await completeExchange(state.currentExchangeId!, user.id, weight);
      await sendTelegramMessage(chatId, 'Exchange completed successfully!');
      state.step = 'MAIN_MENU';
      userStates.set(userId, state);
      return;
    }
  }
} 