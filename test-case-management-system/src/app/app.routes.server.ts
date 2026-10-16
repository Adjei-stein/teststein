import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'login',
    renderMode: RenderMode.Prerender
  },
  {
    // Signed-in pages depend on browser-only auth state, so render them on the client.
    path: '**',
    renderMode: RenderMode.Client
  }
];
