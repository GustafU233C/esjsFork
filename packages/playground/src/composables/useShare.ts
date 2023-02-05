import * as lzs from 'lz-string'
import { useSettings } from '@/composables/useSettings'
import { INITIAL_CODE } from '@/composables/useEditor'
import { useNotification } from '@/composables/useNotification'

const settings = useSettings()

export const useShare = () => {
  function getSharedUrl(code: string) {
    const url = new URL(lzs.compressToEncodedURIComponent(code), window.location.origin)
    url.searchParams.set('layout', settings.settings.value.layout)
    url.searchParams.set('hidePreview', String(settings.settings.value.hidePreview))
    url.searchParams.set('hideEditor', String(settings.settings.value.hideEditor))
    url.searchParams.set('hideConsole', String(settings.settings.value.hideConsole))
    url.searchParams.set('hideOptions', String(settings.settings.value.hideOptions))
    return url
  }

  function decodeSharedUrl() {
    const url = new URL(window.location.href)

    return {
      pathname: url.pathname,
      layout: url.searchParams.get('layout'),
      hideOptions: url.searchParams.get('hideOptions'),
      hideEditor: url.searchParams.get('hideEditor'),
      hidePreview: url.searchParams.get('hidePreview'),
      hideConsole: url.searchParams.get('hideConsole'),
    }
  }

  async function getCodeFromPathname(pathname: string): Promise<string> {
    if (pathname === '/')
      return INITIAL_CODE

    try {
      if (pathname.includes('/github/')) {
        const githubUrl = pathname.replace('/github/', '')
        return await getCodeFromGithub(githubUrl)
      }

      if (pathname.includes('/gist/')) {
        const gistUrl = pathname.replace('/gist/', '')
        return await getCodeFromGist(gistUrl)
      }

      return lzs.decompressFromEncodedURIComponent(pathname.substring(1))
    }
    catch (error: any) {
      useNotification().error(error.toString())
      return INITIAL_CODE
    }
  }

  async function getCodeFromGithub(githubUrl: string) {
    const githubUrlParts = githubUrl.split('/')
    const githubUser = githubUrlParts[0]
    const githubRepo = githubUrlParts[1]
    const githubBranch = githubUrlParts[2]
    const githubFilePath = githubUrlParts.slice(3).join('/')
    const githubRawUrl = `https://raw.githubusercontent.com/${githubUser}/${githubRepo}/${githubBranch}/${githubFilePath}`

    const response = await fetch(githubRawUrl)

    if (response.status !== 200)
      throw new Error('No se pudo obtener el código desde GitHub')

    return response.text()
  }

  async function getCodeFromGist(gistUrl: string) {
    const gistId = gistUrl.split('/')[0]
    const gistRawUrl = `https://gist.githubusercontent.com/${gistId}/raw`

    const response = await fetch(gistRawUrl)

    if (response.status !== 200)
      throw new Error('No se pudo obtener el código desde Gist')

    return response.text()
  }

  return {
    getSharedUrl,
    decodeSharedUrl,
    getCodeFromPathname,
  }
}
