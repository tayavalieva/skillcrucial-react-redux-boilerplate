import express from 'express'
import path from 'path'
import axios from 'axios'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

const { readFile, writeFile, unlink } = require('fs').promises

const Root = () => ''

try {
  // eslint-disable-next-line import/no-unresolved
  // ;(async () => {
  //   const items = await import('../dist/assets/js/root.bundle')
  //   console.log(JSON.stringify(items))

  //   Root = (props) => <items.Root {...props} />
  //   console.log(JSON.stringify(items.Root))
  // })()
  console.log(Root)
} catch (ex) {
  console.log(' run yarn build:prod to enable ssr')
}

let connections = []

const port = process.env.PORT || 8090
const server = express()

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const setHeaders = (req, res, next) => {
  res.set('x-skillcrucial-user', 'e0286edb-2a6f-4c16-a4ec-d762f3b7d4e6')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

server.use(setHeaders)

const saveFile = async (users) =>
  writeFile(`${__dirname}/test.json`, JSON.stringify(users), { encoding: 'utf8' })

const readUsers = async () => {
  return readFile(`${__dirname}/test.json`, { encoding: 'utf8' })
    .then((data) => JSON.parse(data))
    .catch(async () => {
      const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')
      await saveFile(users)
      return users
    })
}

server.get('/api/v1/users', async (req, res) => {
  const users = await readUsers()
  res.json(users)
})

server.post('/api/v1/users', async (req, res) => {
  const newUser = req.body
  let users = await readUsers()
  newUser.id = users[users.length - 1].id + 1
  users = [...users, newUser]
  saveFile(users)
  res.json({ status: 'success', id: newUser.id })
})

server.patch('/api/v1/users/:userID/', async (req, res) => {
  const users = await readUsers()
  const newUser = req.body
  const { userID } = req.params
  const oldUserIndex = users.findIndex((user) => user.id === +userID)
  if (oldUserIndex < 0) {
    newUser.id = +userID
    saveFile([...users, newUser])
  } else {
    const oldUser = users[oldUserIndex]
    users[oldUserIndex] = { ...oldUser, ...newUser }
    saveFile(users)
  }
  res.json({ status: 'success', id: userID })
})

server.delete('/api/v1/users/:userID/', async (req, res) => {
  const users = await readUsers()
  const { userID } = req.params
  saveFile(users.filter((user) => user.id !== +userID))
  res.json({ status: 'success', id: userID })
})

server.delete('/api/v1/users', async (_req, res) => {
  await unlink(`${__dirname}/test.json`)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial - Become an IT HERO'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
