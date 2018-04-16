import { Handler, Context, Callback } from 'aws-lambda';

interface HelloResponse {
  statusCode: number;
  headers: any;
  body: string;
}

const handler: Handler = (event: any, context: Context, callback: Callback) => {
    const response: HelloResponse = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify('Hello world!')
    };
    callback(null, response);
  };
  
  export { handler }