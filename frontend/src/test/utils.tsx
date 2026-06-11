import { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Creates a fresh QueryClient suitable for tests.
 * - retry: false so errors surface immediately without retrying
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface RenderOptions {
  queryClient?: QueryClient;
}

/**
 * Renders the given UI inside a fresh QueryClientProvider.
 * Pass a custom queryClient to pre-seed cache or inspect calls.
 */
export function renderWithProviders(
  ui: ReactNode,
  { queryClient = createTestQueryClient() }: RenderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper }),
  };
}
