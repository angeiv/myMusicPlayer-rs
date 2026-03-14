import { describe, expect, it, vi } from 'vitest';

import {
  hydrateOutputDeviceState,
  switchOutputDeviceWithHydration,
} from '../lib/views/settings-output-device';

describe('settings output device state helpers', () => {
  it('hydrates available devices and always uses current backend-selected device', async () => {
    const hydrated = await hydrateOutputDeviceState({
      getOutputDevices: async () => [
        { id: 'default', name: 'System default', is_default: true },
        { id: 'usb-dac', name: 'USB DAC', is_default: false },
      ],
      getOutputDevice: async () => 'usb-dac',
    });

    expect(hydrated).toEqual({
      outputDevices: [{ id: 'usb-dac', name: 'USB DAC', is_default: false }],
      selectedDeviceId: 'usb-dac',
    });
  });

  it('rolls UI selection back to actual device when switch fails', async () => {
    const setOutputDevice = vi.fn().mockRejectedValue(new Error('failed switch'));
    const getOutputDevice = vi.fn().mockResolvedValue('default');

    const result = await switchOutputDeviceWithHydration(
      {
        setOutputDevice,
        getOutputDevice,
      },
      'usb-dac',
      'default',
    );

    expect(setOutputDevice).toHaveBeenCalledWith('usb-dac');
    expect(result).toEqual({ selectedDeviceId: 'default', committed: false });
  });
});
