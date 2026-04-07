import type { CapacitorConfig } from '@capacitor/cli'

const devServerUrl = process.env.CAP_SERVER_URL?.trim()

const config: CapacitorConfig = {
  appId: 'com.bryantlabs.trackora',
  appName: 'Trackora',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(devServerUrl
      ? {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith('http://'),
        }
      : {}),
  },
}

export default config
