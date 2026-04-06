import type { OutputDeviceInfo } from '../types';
import { commonCopy } from '../copy/zh-cn';

export function describeSelectedOutputDevice(
  outputDevices: OutputDeviceInfo[],
  selectedDeviceId: string,
): string {
  if (!selectedDeviceId || selectedDeviceId === 'default') {
    return commonCopy.systemDefault;
  }

  return outputDevices.find((device) => device.id === selectedDeviceId)?.name ?? commonCopy.systemDefault;
}

export async function hydrateOutputDeviceState(deps: {
  getOutputDevices: () => Promise<OutputDeviceInfo[]>;
  getOutputDevice: () => Promise<string | null>;
}): Promise<{ outputDevices: OutputDeviceInfo[]; selectedDeviceId: string }> {
  const [devices, selected] = await Promise.all([deps.getOutputDevices(), deps.getOutputDevice()]);
  const outputDevices = (devices ?? []).filter((device) => !device.is_default);
  const selectedDeviceId = typeof selected === 'string' && selected ? selected : 'default';
  return { outputDevices, selectedDeviceId };
}

export async function switchOutputDeviceWithHydration(
  deps: {
    setOutputDevice: (deviceId: string) => Promise<void>;
    getOutputDevice: () => Promise<string | null>;
  },
  requestedDeviceId: string,
  previousDeviceId: string,
): Promise<{ selectedDeviceId: string; committed: boolean }> {
  const normalize = (value: string | null | undefined) => value ?? 'default';

  try {
    await deps.setOutputDevice(requestedDeviceId);
    const actual = normalize(await deps.getOutputDevice());
    const requested = normalize(requestedDeviceId === 'default' ? null : requestedDeviceId);
    return { selectedDeviceId: actual, committed: actual === requested };
  } catch {
    try {
      const actual = normalize(await deps.getOutputDevice());
      return { selectedDeviceId: actual, committed: false };
    } catch {
      return { selectedDeviceId: previousDeviceId, committed: false };
    }
  }
}
