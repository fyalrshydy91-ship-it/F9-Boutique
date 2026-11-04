import { Boutique } from './features/boutique/Boutique';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function App() {
  return <QueryClientProvider client={queryClient}><Boutique /></QueryClientProvider>;
}

export default App;
