export class SSEService {
  constructor() {
    this.clients = new Map();
  }

  addClient(userId, reply) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }
    
    // Add this reply stream to the user's active connections
    this.clients.get(userId).push(reply);
    console.log(`SSE: Client added for user ${userId}. Total connection(s): ${this.clients.get(userId).length}`);
  }

  removeClient(userId, reply) {
    if (this.clients.has(userId)) {
      let userClients = this.clients.get(userId);
      userClients = userClients.filter(client => client !== reply);
      
      if (userClients.length === 0) {
        this.clients.delete(userId);
        console.log(`SSE: All clients removed for user ${userId}`);
      } else {
        this.clients.set(userId, userClients);
        console.log(`SSE: Client removed for user ${userId}. Remaining: ${userClients.length}`);
      }
    }
  }

  sendEventToUser(userId, event, data) {
    const userClients = this.clients.get(userId.toString());
    
    if (userClients && userClients.length > 0) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      userClients.forEach(reply => {
        try {
          reply.raw.write(payload);
        } catch (err) {
          console.error(`SSE: Failed to send event to user ${userId}`, err);
        }
      });
      console.log(`SSE: Sent event "${event}" to user ${userId}`);
    } else {
      console.log(`SSE: No active clients found for user ${userId}`);
    }
  }
}
