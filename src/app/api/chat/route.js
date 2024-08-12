import { NextResponse } from 'next/server';

// System prompt for the AI, providing guidelines on how to respond to users
const systemPrompt = 'Your system prompt here'; // Update this with your actual system prompt

// POST function to handle incoming requests
export async function POST(req) {
  const data = await req.json(); // Parse the JSON body of the incoming request

  try {
    // Create a chat completion request to the API using fetch
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, // Use your GROQ API key
      },
      body: JSON.stringify({
        model: 'Llama3-8b-8192', // Specify the model to use
        messages: [{ role: 'system', content: systemPrompt }, ...data], // Include the system prompt and user messages
        stream: true, // Enable streaming responses if supported
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error from API:', errorData);
      return new NextResponse(`Error: ${errorData.error.message}`, { status: response.status });
    }

    // Create a ReadableStream to handle the streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder(); // Create a TextEncoder to convert strings to Uint8Array
        let buffer = ''; // Buffer to accumulate chunks

        try {
          const reader = response.body.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode the chunk and accumulate it
            buffer += new TextDecoder().decode(value);

            // Process complete JSON objects from the buffer
            while (true) {
              const boundary = buffer.indexOf('\n');
              if (boundary === -1) break; // No complete JSON object found

              // Extract and clean up the JSON string
              const jsonString = buffer.substring(0, boundary).replace(/^data: /, '');
              buffer = buffer.substring(boundary + 1);

              // Parse the JSON object
              try {
                const decodedChunk = JSON.parse(jsonString);
                const content = decodedChunk.choices[0]?.delta?.content; // Extract the content from the chunk
                if (content) {
                  const text = encoder.encode(content); // Encode the content to Uint8Array
                  controller.enqueue(text); // Enqueue the encoded text to the stream
                }
              } catch (parseError) {
                console.error('Error parsing JSON chunk:', parseError);
                // Optionally handle or log parse errors
              }
            }
          }
        } catch (err) {
          controller.error(err); // Handle any errors that occur during streaming
        } finally {
          controller.close(); // Close the stream when done
        }
      },
    });

    return new NextResponse(stream); // Return the stream as the response

  } catch (error) {
    console.error('Error handling POST request:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
