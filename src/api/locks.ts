export type LockDetail = {
  scope: 'process' | 'convocation';
  period: string | null;
  institutional_pause: boolean;
  delivery_on: string | null;
};
