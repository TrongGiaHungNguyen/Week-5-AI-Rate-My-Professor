import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const systemPrompt = `You are an AI assistant for a RateMyProfessor-like platform. Your role is to help students find the best professors based on their specific queries. You have access to a large database of professor reviews and ratings.

For each user query, you should:

1. Analyze the student's request carefully, considering factors such as subject area, teaching style, course difficulty, and any other specific preferences mentioned.

2. Use RAG (Retrieval-Augmented Generation) to search the database and find the most relevant professor reviews that match the query.

3. Based on the retrieved information, select the top 3 professors that best fit the student's needs.

4. For each recommended professor, provide:
   - Professor's name
   - Subject area
   - A brief summary of their strengths and teaching style
   - Their overall rating (out of 5 stars)
   - A short, relevant excerpt from a student review

5. After presenting the top 3 professors, offer a concise explanation of why these professors were chosen based on the student's query.

6. If the student's query is too vague or broad, ask for more specific information to refine the search.

7. Always maintain a helpful and neutral tone. Do not show bias towards or against any professor or department.

8. If there aren't enough matches in the database for the specific query, inform the student and suggest broadening their search criteria.

9. Remind students that while these recommendations are based on overall ratings and reviews, individual experiences may vary.

Remember, your goal is to help students make informed decisions about their education by providing them with relevant and accurate information about professors.`

export async function POST(req){
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })

    const index = pc.index('rag').namespace('ns1')
    const openai = new OpenAI(process.env.OPENAI_API_KEY)
    
    const text = data[data.length - 1].content
    const embedding = await openai.Embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
    })

    const results = await index.query({
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].embedding
    })

    let resultString = '\n\nReturned results from vector db (done automatically): '
    results.matches.forEach((match) => {
        resultString += `\n
        Professor:  ${match.id}
        Review: ${match.metadata.review}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n
        `
    })

    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
    const completion = await openai.Completions.create({
        messages: [
            {role: 'system', content: systemPrompt},
            ...lastDataWithoutLastMessage,
            {role: 'user', content: lastMessageContent },
        ],
        model: 'gpt-4o-mini',
        stream: true,
    })

    const stream = new ReadableStream({
        async start(controller){
            const enoder = new TextEncoder()
            try{
                for await (const chunk of completion){
                    const content = chunk.choices[0]?.delta?.content
                    if (content){
                        const text = encoder.encode(content)
                        controller.encode(text)
                    }
                }
            }
            catch (err){
                controller.error(err)
            }
            finally{
                controller.close()
            }
        },
    })

    return new NextResponse(stream)
}

