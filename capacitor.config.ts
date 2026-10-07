import type { CapacitorConfig } from '@capacitor/cli';

// Production always uses local assets. Do not add server.url: that turns this
// into a remote wrapper and brings network/auth delays back to every launch.
const config: CapacitorConfig = {
  appId: 'com.ktanzyl.liftline',
  appName: 'Liftline',
  webDir: 'dist-mobile',
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#f5f7ff' },
  },
};

export default config;
