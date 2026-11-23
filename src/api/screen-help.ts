import { api } from '@/api/client';

export type ScreenHelp = { screen: string; title: string; content: string };

export const listAvailableScreenHelp = () => api<{ help: ScreenHelp[] }>('/help/available');
