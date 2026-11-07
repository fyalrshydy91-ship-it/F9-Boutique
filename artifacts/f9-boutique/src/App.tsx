import { CatalogBoutique } from './features/boutique/CatalogBoutique';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function App() {
  return <QueryClientProvider client={queryClient}><CatalogBoutique /></QueryClientProvider>;
}

export default App;
