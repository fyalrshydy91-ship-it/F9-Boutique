import { useGetCatalog, getGetCatalogQueryKey } from '@workspace/api-client-react';
import { Boutique } from './Boutique';
import { useStore } from './_use-store';

export function CatalogBoutique() {
  const [language, setLanguage] = useStore<'en' | 'ar'>('f9-language', 'en');
  const ar = language === 'ar';
  const catalog = useGetCatalog({
    query: {
      queryKey: getGetCatalogQueryKey(), staleTime: 30000,
      refetchInterval: 60000, refetchOnWindowFocus: true, retry: false,
    },
  });
  if (!catalog.isError && catalog.data?.products.length && catalog.data.boutiques.length) {
    return <Boutique products={catalog.data.products} boutiques={catalog.data.boutiques}
      lang={language} setLang={setLanguage}/>;
  }
  const empty = !catalog.isError && !!catalog.data && !catalog.isFetching;
  return <div className="f9" dir={ar ? 'rtl' : 'ltr'} lang={language}>
    <div className="announcement">F9 BOUTIQUE — {ar ? 'عالم منتقى من البوتيكات المستقلة' : 'A CURATED WORLD OF INDEPENDENT BOUTIQUES'}</div>
    <div className="page-intro" style={{ minHeight: '70vh', display: 'grid', placeContent: 'center', gap: 24 }}>
      <span className="logo"><strong>F9</strong><span>B O U T I Q U E</span></span>
      <div role={catalog.isError ? 'alert' : 'status'} aria-live="polite">
        <h1>{catalog.isFetching ? (ar ? 'جارٍ تحميل مختاراتك' : 'Loading your edit')
          : empty ? (ar ? 'مختارات جديدة قريباً' : 'New pieces coming soon')
            : (ar ? 'تعذر تحميل المجموعة' : 'The collection is unavailable')}</h1>
        <p>{catalog.isFetching ? (ar ? 'لحظات لنحضر أحدث قطع البوتيكات.' : 'Gathering the latest pieces from our boutiques.')
          : empty ? (ar ? 'لا توجد قطع متاحة حالياً.' : 'There are no pieces available right now.')
            : (ar ? 'يرجى المحاولة مجدداً. لم يتم تغيير حقيبتك أو مفضلتك.' : 'Please try again. Your bag and favorites have not been changed.')}</p>
      </div>
      {!catalog.isFetching && <button className="btn" onClick={() => void catalog.refetch({ cancelRefetch: false })}>
        {ar ? 'إعادة المحاولة' : 'Try again'}</button>}
      <button className="text-link" onClick={() => setLanguage(ar ? 'en' : 'ar')}>{ar ? 'English' : 'العربية'}</button>
    </div>
  </div>;
}
