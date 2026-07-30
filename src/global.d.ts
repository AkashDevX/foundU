declare module 'react-native-vector-icons/Feather';

/** Some RN / TS setups omit DOM lib; maps use btoa for data-URIs. */
declare function btoa(data: string): string;
