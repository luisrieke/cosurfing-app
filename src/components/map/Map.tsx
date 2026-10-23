// Platform entry point. Metro resolves Map.web.tsx on web and Map.native.tsx on iOS/Android;
// this file only exists so TypeScript has a single module to type against.
export { PlacesMap } from './Map.native';
