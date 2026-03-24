const tap = require('tap')
const buildFastify = require('../app')

let fastify = null
tap.beforeEach(() => {
  fastify = buildFastify()
})

tap.afterEach(() => {
  fastify.close()
})

tap.test('GET `/` route returns HTML for browser requests', (t) => {
  fastify.inject(
    {
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html,application/xhtml+xml' },
    },
    (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 200)
      t.match(response.headers['content-type'], /text\/html/)
      t.ok(response.payload.includes('Açık Kuran API'))
      t.ok(response.payload.includes('<code>https://api.acikkuran.com</code>'))
      t.ok(response.payload.includes('/authors'))
      t.ok(response.payload.includes('/surahs'))
      t.end()
    }
  )
})

tap.test('GET `/` route returns JSON for API requests', (t) => {
  fastify.inject(
    {
      method: 'GET',
      url: '/',
    },
    (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 200)
      t.equal(JSON.parse(response.payload).name, 'Açık Kuran API')
      t.end()
    }
  )
})
