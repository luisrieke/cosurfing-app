import { useLocalSearchParams } from 'expo-router';

import { categoryFromSlug } from '@/lib/rankingCategories';

import NotFound from '../+not-found';
import { CityPage } from './index';

export default function CityCategoryRoute() {
  const { category: slug } = useLocalSearchParams<{ category: string }>();
  const category = categoryFromSlug(slug);
  if (!category) return <NotFound />;
  return <CityPage category={category} />;
}
