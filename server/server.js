/* eslint-disable import/no-duplicates */
import express from 'express'
import path from 'path'
import axios from 'axios'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'

import cookieParser from 'cookie-parser'
import Html from '../client/html'

let connections = []

const port = process.env.PORT || 3000
const server = express()

const { readFile, writeFile, unlink } = require('fs').promises

const setHeaders = (req, res, next) => {
  res.set('x-skillcrucial-user', 'e0286edb-2a6f-4c16-a4ec-d762f3b7d4e6')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

server.use(cors())

server.use(express.static(path.resolve(__dirname, '../dist/assets')))
server.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }))
server.use(bodyParser.json({ limit: '50mb', extended: true }))

server.use(cookieParser())

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

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const echo = sockjs.createServer()
echo.on('connection', (conn) => {
  connections.push(conn)
  conn.on('data', async () => {})

  conn.on('close', () => {
    connections = connections.filter((c) => c.readyState !== 3)
  })
})

server.get('/', (req, res) => {
  // const body = renderToString(<Root />);
  const title = 'Server side Rendering'
  res.send(
    Html({
      body: '',
      title
    })
  )
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

echo.installHandlers(app, { prefix: '/ws' })

// eslint-disable-next-line no-console
console.log(`Serving at http://localhost:${port}`)
