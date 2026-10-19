import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import 'dotenv/config'
import { router } from './routes'

const app = express()

app.use(express.json())
app.use(cors())
app.use(router)

const PORT = process.env.PORT || 3333

app.listen(PORT, () => console.log(`running on port: ${PORT}`))

