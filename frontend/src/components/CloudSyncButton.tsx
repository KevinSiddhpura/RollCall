import { TouchableOpacity, ViewStyle } from 'react-native';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react-native';
import type { SyncStatus } from '../services/syncService';

const STATUS_COLOR: Record<SyncStatus, string> = {
  idle:    'rgba(255,255,255,0.45)',
  syncing: '#FCD34D',
  synced:  '#4ADE80',
  error:   '#F87171',
  offline: 'rgba(255,255,255,0.25)',
};

interface Props {
  status: SyncStatus;
  onPress: () => void;
  size?: number;
  style?: ViewStyle;
}

export default function CloudSyncButton({ status, onPress, size = 16, style }: Props) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle;
  const Icon = status === 'syncing' ? RefreshCw : status === 'offline' ? CloudOff : Cloud;

  return (
    <TouchableOpacity
      style={[
        {
          width: 36, height: 36, borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.15)',
          justifyContent: 'center', alignItems: 'center', flexShrink: 0,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Icon size={size} color={color} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}
