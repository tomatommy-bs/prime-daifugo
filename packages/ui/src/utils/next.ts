export interface NextPageProps<T extends string = never> {
  params: Record<T, string>;
  searchParams: Record<string, string | string[] | undefined>;
}
