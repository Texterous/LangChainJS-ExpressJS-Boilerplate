import express from "express"
import bodyParser from "body-parser"
import cors from "cors"
import swaggerJsdoc from "swagger-jsdoc"
import swaggerUi from "swagger-ui-express"
import dotenv from "dotenv"
import { check, validationResult } from "express-validator"
import rateLimit from "express-rate-limit"
import morgan from "morgan"
import fs from "fs"
import path from "path"
import ejs from "ejs"

import { methods } from "./methods.js"

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(bodyParser.json())
app.use(cors())

const logsDir = path.join(process.cwd(), "logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir)
}

const logStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
})

app.use(morgan("combined", { stream: logStream }))
// Set up rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})

app.use(limiter)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Internal server error" })
})

// Set up OpenAPI documentation
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "LangChain Express API",
      version: "1.0.0",
      description: "A simple API to interact with LangChain prompts",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  },
  apis: ["./app.js"],
}

// Generate API routes and documentation based on methods
methods.forEach((method) => {
  const {
    id,
    route,
    method: httpMethod,
    description,
    inputVariables,
    execute,
  } = method

  // Create API route
  app[httpMethod](
    route,
    inputVariables.map((variable) =>
      check(variable).notEmpty().trim().escape()
    ),
    async (req, res) => {
      // Validate input
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }
      const input = inputVariables.reduce((acc, variable) => {
        acc[variable] = req.body[variable]
        return acc
      }, {})

      try {
        const result = await execute(input)

        if (result.stream) {
          res.setHeader("Content-Type", "application/ndjson")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.flushHeaders()
          result.stream.on("data", (chunk) => {
            res.write(JSON.stringify({ text: chunk.toString() }) + "\n")
          })
          result.stream.on("end", () => {
            res.end()
          })

          req.on("close", () => {
            result.stream.destroy()
          })
        } else {
          res.json({ text: result.text })
        }
      } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message })
      }
    }
  )

  // Add OpenAPI documentation for the route
  options.definition.paths = options.definition.paths || {}
  options.definition.paths[route] = {
    [httpMethod]: {
      summary: description,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: inputVariables.reduce((acc, variable) => {
                acc[variable] = { type: "string" }
                return acc
              }, {}),
              required: inputVariables,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Successful operation",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        500: {
          description: "Internal server error",
        },
      },
    },
  }
})

const specs = swaggerJsdoc(options)

// Frontend
app.get("/", (req, res) => {
  fs.readFile("./views/index.ejs", "utf8", (err, data) => {
    if (err) {
      console.error(err)
      return res.status(500).send("Error")
    }
    const html = ejs.render(data, { methods })
    res.send(html)
  })
})

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs))

app.listen(port, () => {
  console.log(`LangChain Express app listening at http://localhost:${port}`)
})
