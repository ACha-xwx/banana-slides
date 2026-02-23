import { test, expect } from '@playwright/test'
import { seedProjectWithImages } from './helpers/seed-project'
import { execSync } from 'child_process'
import * as path from 'path'

const FRONTEND_DIR = process.cwd().endsWith('frontend') ? process.cwd() : path.join(process.cwd(), 'frontend')
const PROJECT_ROOT = path.resolve(FRONTEND_DIR, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'backend', 'instance', 'database.db')

function sql(query: string): string {
  return execSync(`sqlite3 -cmd ".timeout 5000" "${DB_PATH}" "${query.replace(/"/g, '\\"')}"`)
    .toString().trim()
}

/** Derive backend base URL from BASE_URL env (frontend port + 2000) */
function getBackendBase(): string {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  const url = new URL(base)
  url.port = String(parseInt(url.port || '3000') + 2000)
  return url.origin
}

test.describe('Regenerate page status (integration)', () => {
  test('page status is GENERATING immediately after batch generate API', async () => {
    const backend = getBackendBase()
    const { projectId, pageIds } = await seedProjectWithImages(backend, 1)
    const pageId = pageIds[0]

    // Set page to FAILED (simulating failed image generation)
    sql(`UPDATE pages SET status='FAILED' WHERE id='${pageId}'`)
    sql(`UPDATE projects SET template_style='minimalist modern' WHERE id='${projectId}'`)

    // Verify FAILED before regeneration
    const before = await (await fetch(`${backend}/api/projects/${projectId}`)).json()
    expect(before.data.pages.find((p: any) => p.page_id === pageId).status).toBe('FAILED')

    // Call batch generate images API
    await fetch(`${backend}/api/projects/${projectId}/generate/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'zh', page_ids: [pageId] }),
    })

    // Immediately fetch — page status should be GENERATING, not FAILED
    const after = await (await fetch(`${backend}/api/projects/${projectId}`)).json()
    expect(after.data.pages.find((p: any) => p.page_id === pageId).status).toBe('GENERATING')
  })

  test('page status is GENERATING immediately after single-page generate API', async () => {
    const backend = getBackendBase()
    const { projectId, pageIds } = await seedProjectWithImages(backend, 1)
    const pageId = pageIds[0]

    // Set page to FAILED and add description_content (required by single-page endpoint)
    const desc = JSON.stringify({ text: 'Test slide content for image generation.' }).replace(/'/g, "''")
    sql(`UPDATE pages SET status='FAILED', description_content='${desc}' WHERE id='${pageId}'`)
    sql(`UPDATE projects SET template_style='minimalist modern' WHERE id='${projectId}'`)

    // Call single-page generate image API
    await fetch(`${backend}/api/projects/${projectId}/pages/${pageId}/generate/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_regenerate: true, language: 'zh' }),
    })

    // Immediately fetch — page status should be GENERATING
    const after = await (await fetch(`${backend}/api/projects/${projectId}`)).json()
    expect(after.data.pages.find((p: any) => p.page_id === pageId).status).toBe('GENERATING')
  })
})
