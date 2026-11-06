import 'react-native';

declare module 'react-native' {
  interface PressableStateCallbackType {
    /** Set by react-native-web; always undefined on iOS and Android. */
    readonly hovered?: boolean;
    readonly focused?: boolean;
  }
}
