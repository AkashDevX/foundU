declare module 'react-native-vector-icons/Feather';
declare module 'react-native-vector-icons/MaterialCommunityIcons';

/** Some RN / TS setups omit DOM lib; maps use btoa for data-URIs. */
declare function btoa(data: string): string;
