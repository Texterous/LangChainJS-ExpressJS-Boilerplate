import { OpenAI } from "langchain/llms"
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  PromptTemplate,
  SystemMessagePromptTemplate,
} from "langchain/prompts"
import { LLMChain } from "langchain/chains"
import { PassThrough } from "stream"
import { CallbackManager } from "langchain/callbacks"

export const methods = [
  {
    id: "translation",
    route: "/translate",
    method: "post",
    description: "Translates a text from one language to another",
    inputVariables: ["Input Language", "Output Language", "Text"],
    execute: async (input) => {
      const llm = new OpenAI({ temperature: 0 })

      const template =
        "Translate the following text from {Input Language} to {Output Language}\n```{Text}```\n\n"
      const prompt = new PromptTemplate({
        template,
        inputVariables: Object.keys(input),
      })
      const chain = new LLMChain({ llm, prompt })
      const res = await chain.call(input)
      return res
    },
  },
  {
    id: "poem",
    route: "/poem",
    method: "post",
    description: "Generates a short poem about your topic (Use as stream)",
    inputVariables: ["Topic"],
    execute: async (input) => {
      const outputStream = new PassThrough()

      const callbackManager = CallbackManager.fromHandlers({
        async handleLLMNewToken(token) {
          outputStream.write(token)
        },
      })
      const llm = new OpenAI({
        temperature: 0,
        streaming: true,
        callbackManager,
      })

      const template = "Write me very short a poem about {Topic}."
      const prompt = new PromptTemplate({
        template,
        inputVariables: Object.keys(input),
      })
      const chain = new LLMChain({ llm, prompt })

      chain.call(input).then((response) => {
        console.log(response)
        outputStream.end()
      })

      return { stream: outputStream }
    },
  },
]
