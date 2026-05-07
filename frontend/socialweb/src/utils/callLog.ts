export type ParsedCallLog = {
  isCallLog: boolean;
  callType?: 'audio' | 'video';
  status?: 'missed' | 'rejected' | 'ended';
  durationSec?: number;
};

const CALL_LOG_PREFIX = '[CALL]';

export const createCallLog = (
  callType: 'audio' | 'video',
  status: 'missed' | 'rejected' | 'ended',
  durationSec?: number,
) => {
  const durationPart =
    typeof durationSec === 'number' && durationSec >= 0 ? `|duration=${Math.floor(durationSec)}` : '';
  return `${CALL_LOG_PREFIX}|type=${callType}|status=${status}${durationPart}`;
};

export const parseCallLog = (content?: string | null): ParsedCallLog => {
  if (!content || !content.startsWith(CALL_LOG_PREFIX)) {
    return { isCallLog: false };
  }

  const parts = content.split('|').slice(1);
  const map: Record<string, string> = {};
  parts.forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      map[key] = value;
    }
  });

  const parsedDuration = Number(map.duration);
  return {
    isCallLog: true,
    callType: map.type === 'video' ? 'video' : 'audio',
    status: map.status === 'rejected' ? 'rejected' : map.status === 'ended' ? 'ended' : 'missed',
    durationSec: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
  };
};

export const formatCallDuration = (totalSec: number) => {
  const safeSec = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;
  if (hours > 0) {
    return `${hours}g ${minutes}p ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}p ${seconds}s`;
  }
  return `${seconds}s`;
};

export const getCallLogPreview = (
  content?: string | null,
  isFromMe = false,
) => {
  const parsed = parseCallLog(content);
  if (!parsed.isCallLog) {
    return null;
  }

  const callLabel = parsed.callType === 'video' ? 'cuộc gọi video' : 'cuộc gọi thoại';
  const subject = isFromMe ? 'Bạn' : 'Đối phương';

  if (parsed.status === 'rejected') {
    return `${subject} đã từ chối ${callLabel}`;
  }

  if (parsed.status === 'missed') {
    return `Cuộc gọi nhỡ (${callLabel})`;
  }

  if (parsed.status === 'ended') {
    if (typeof parsed.durationSec === 'number') {
      return `${callLabel} • ${formatCallDuration(parsed.durationSec)}`;
    }
    return `${callLabel} đã kết thúc`;
  }

  return `${callLabel}`;
};
