import { Controller, Get, Header, Query } from '@nestjs/common';

const APP_SCHEME = 'constructcoordinator';

/**
 * Public landing page for invite-email links. Tries to deep-link into the
 * app; if nothing handles the scheme the visitor just sees the download
 * instructions. Deliberately minimal — a real marketing/landing site is out
 * of scope for this phase.
 */
@Controller('invite')
export class InvitePageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  landing(
    @Query('project') projectId?: string,
    @Query('name') projectName?: string,
  ): string {
    const safeName = escapeHtml(projectName ?? 'a project');
    const deepLink = projectId
      ? `${APP_SCHEME}://project/${encodeURIComponent(projectId)}`
      : `${APP_SCHEME}://`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Construct Coordinator — invitation</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 48px auto; padding: 0 20px; color: #1a1a2e; }
    a.button { display: inline-block; background: #1d6ef5; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; margin: 16px 0; }
    p.muted { color: #667; font-size: 14px; }
  </style>
</head>
<body>
  <h2>You've been invited to ${safeName}</h2>
  <a class="button" href="${deepLink}">Open in the app</a>
  <p class="muted">
    Nothing happened? You need the Construct Coordinator app first:
    install it from your team's distribution link (TestFlight / Play Store),
    register with the email address this invitation was sent to, and the
    project will be waiting for you.
  </p>
  <script>
    // Best-effort auto-open; harmless no-op when the app isn't installed.
    setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)}; }, 400);
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
