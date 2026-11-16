import { Redirect, useLocalSearchParams } from 'expo-router';

/** The map is the home page; this keeps old /map links working. */
export default function MapRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/', params }} />;
}
