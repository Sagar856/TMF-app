import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trackmoneyflow.app',
  appName: 'Track Money Flow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_tmf',
      iconColor: '#dc2626',
    },
  },
};

export default config;
