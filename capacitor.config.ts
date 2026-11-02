import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trackmoneyflow.app',
  appName: 'MINARTH',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_tmf',
      iconColor: '#a78bfa',
    },
  },
};

export default config;
