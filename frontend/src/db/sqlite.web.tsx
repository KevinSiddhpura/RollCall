import React from 'react';
import { View, Text, Alert } from 'react-native';

export const SQLiteProvider = ({ children }: any) => {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: '#ffcc00', padding: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: 'bold' }}>
          Web Preview Mode: Offline Database is disabled on web.
        </Text>
      </View>
      {children}
    </View>
  );
};

export const useSQLiteContext = () => ({
  getFirstAsync: async () => null,
  getAllAsync: async () => [],
  runAsync: async () => {
    Alert.alert("Web Preview", "Saving is disabled on web preview. Please use a mobile device.");
    return { lastInsertRowId: 1 };
  },
  withTransactionAsync: async (cb: any) => { await cb(); },
});
