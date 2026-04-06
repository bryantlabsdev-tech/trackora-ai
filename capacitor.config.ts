import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.bryantlabs.trackora',
  appName: 'Trackora',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
