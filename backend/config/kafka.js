const { Kafka } = require('kafkajs');
const dotenv = require('dotenv');
const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const Billing = require('../models/Billing');
const { redisClient, invalidateCache } = require('./redis');

dotenv.config();

const kafka = new Kafka({
  clientId: 'uber-simulation',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionalId: 'uber-producer',
  maxInFlightRequests: 20
});

const consumer = kafka.consumer({ 
  groupId: 'uber-simulation-group',
  sessionTimeout: 30000,
  heartbeatInterval: 5000,
  maxWaitTimeInMs: 1000
});

// -------------------- MESSAGE BATCHING OPTIMIZATION --------------------

// Message batching configuration
const batchedMessages = {};
const batchTimeout = 50; // ms 
const maxBatchSize = 100;

// Optimized message publishing function with batching support
const publishMessageWithBatching = async (topic, message) => {
  // Initialize batch if it doesn't exist
  if (!batchedMessages[topic]) {
    batchedMessages[topic] = {
      messages: [],
      timeoutId: null
    };
  }
  
  const batch = batchedMessages[topic];
  
  // Add message to batch
  batch.messages.push({
    value: JSON.stringify(message)
  });
  
  // Function to flush the batch
  const flushBatch = async () => {
    if (batch.messages.length === 0) return;
    
    const messagesToSend = [...batch.messages];
    batch.messages = [];
    
    try {
      await producer.send({
        topic,
        messages: messagesToSend,
      });
      console.log(`Sent batch of ${messagesToSend.length} messages to ${topic}`);
    } catch (error) {
      console.error(`Error sending batch to ${topic}:`, error);
      
      // On failure, attempt to send messages individually if there were multiple
      if (messagesToSend.length > 1) {
        try {
          for (const msg of messagesToSend) {
            await producer.send({
              topic,
              messages: [msg],
            });
          }
          console.log(`Recovered by sending ${messagesToSend.length} messages individually to ${topic}`);
        } catch (fallbackError) {
          console.error('Failed to recover batch send with individual sends:', fallbackError);
        }
      }
    }
  };
  
  // Clear existing timeout if any
  if (batch.timeoutId) {
    clearTimeout(batch.timeoutId);
  }
  
  // Flush immediately if batch size reaches maximum
  if (batch.messages.length >= maxBatchSize) {
    await flushBatch();
  } else {
    // Otherwise, set timeout to flush soon
    batch.timeoutId = setTimeout(flushBatch, batchTimeout);
  }
  
  return true;
};

const sendMessage = async (topic, message) => {
  try {
    return await publishMessageWithBatching(topic, message);
  } catch (error) {
    console.error(`Error sending message to topic ${topic}:`, error);
    
    // Fallback to non-batched send if batching fails
    try {
      await producer.send({
        topic,
        messages: [
          { value: JSON.stringify(message) }
        ],
      });
      return true;
    } catch (fallbackError) {
      console.error(`Fallback error sending message to topic ${topic}:`, fallbackError);
      return false;
    }
  }
};

// -------------------- HANDLER OPTIMIZATIONS --------------------

// Handler for ride_requests topic
const handleRideRequest = async (message) => {
  try {
    const { ride_id, customer_id } = message.data;
    
    if (!customer_id) {
      console.warn(`Incomplete ride request data for ${ride_id}`);
      return;
    }
    
    console.log(`Processing ride request: ${ride_id}`);
    
    
    // Batch invalidate related caches
    const cacheKeys = [
      `*customer*${customer_id}*`
    ];
    
    // Invalidate caches in parallel
    await Promise.all(cacheKeys.map(key => invalidateCache(key)));
    
    console.log(`Ride request ${ride_id} processed successfully`);
  } catch (error) {
    console.error(`Error handling ride request: ${error.message}`);
  }
};

const handleRideCancellation = async (message) => {
  try {
    const { ride_id, cancellation_reason, by_user_type } = message;
    
    console.log(`Handling ride cancellation for ride ${ride_id}`);
    
    // Depending on your application logic, you might need to:
    // 1. Update the driver's availability
    // 2. Notify customers through a notification system
    // 3. Update ride statistics
    
    // Example: Update driver stats on cancellations
    if (by_user_type === 'driver' && message.driver_id) {
      await Driver.findOneAndUpdate(
        { driver_id: message.driver_id },
        { $inc: { cancellation_count: 1 } }
      );
    }
    
  } catch (error) {
    console.error('Error handling ride cancellation:', error);
  }
};

// Handler for ride_responses topic
const handleRideResponse = async (message) => {
  try {
    const { type, data } = message;
    const { rideId, driverId } = data;
    
    if (!rideId) {
      console.warn('Missing ride ID in ride response');
      return;
    }
    
    // Use a switch statement for different message types
    switch (type) {
      case 'RIDE_ACCEPTED':
        console.log(`Driver ${driverId} accepted ride ${rideId}`);
        
        // Update ride status
        await Ride.updateOne(
          { ride_id: rideId },
          { $set: { status: 'accepted' } }
        );
        break;
        
      case 'RIDE_REJECTED':
        console.log(`Driver ${driverId} rejected ride ${rideId}: ${data.reason}`);
        
        await Promise.all([
          // Update ride status
          Ride.updateOne(
            { ride_id: rideId },
            { $set: { status: 'cancelled', cancellation_reason: data.reason } }
          ),
          
          // Make driver available again
          Driver.updateOne(
            { driver_id: driverId },
            { $set: { status: 'available' } }
          )
        ]);
        break;
        
case 'RIDE_COMPLETED':
  console.log(`Ride ${rideId} completed`);

  case 'RIDE_CANCELLED':
    console.log(`Ride ${rideId} cancelled`);
  
  // Update ride status
  await Ride.updateOne(
    { ride_id: rideId },
    { $set: { status: 'completed' } }
  );
  
  // Make driver available again
  if (ride && ride.driver_id) {
    await Driver.updateOne(
      { driver_id: ride.driver_id },
      { 
        $set: { status: 'available' },
        $push: { ride_history: rideId }
      }
    );
  }
  
  // NOTE: Bill creation is now handled directly by the controller
  
  break;
        
      default:
        console.log(`Unknown ride response type: ${type}`);
    }
  } catch (error) {
    console.error(`Error handling ride response: ${error.message}`);
  }
};

// Handler for billing_events topic
const handleBillingEvent = async (message) => {
  try {
    const { type, data } = message;
    
    switch (type) {
      case 'BILLING_CREATED':
        console.log(`Billing created: ${data.bill_id} for ride ${data.ride_id}`);
        break;
        
      case 'PAYMENT_PROCESSED':
        console.log(`Payment processed for bill ${data.billingId}: ${data.status}`);
        
        if (!data.billingId) {
          console.warn('Missing billing ID in payment processed event');
          return;
        }
        
        const bill = await Billing.findOne({ bill_id: data.billingId });
        if (bill) {
          // Execute updates in parallel
          await Promise.all([

            // Update billing status
            Billing.updateOne(
              { bill_id: data.billingId },
              { $set: { payment_status: data.status } }
            ),

            // Update ride payment status
            Ride.updateOne(
              { ride_id: bill.ride_id },
              { $set: { payment_status: data.status } }
            ),
            
            // Update driver earnings if payment was successful
            data.status === 'completed' ? 
              Driver.updateOne(
                { driver_id: bill.driver_id },
                { $inc: { earnings: bill.total_amount * 0.8 } } // Driver gets 80% of fare
              ) : Promise.resolve()
          ]);
          
          // Invalidate related caches
          await invalidateCache('*billing*');
        }
        break;
        
      default:
        console.log(`Unknown billing event type: ${type}`);
    }
  } catch (error) {
    console.error(`Error handling billing event: ${error.message}`);
  }
};

// Handler for driver_events topic - optimized
const handleDriverEvent = async (message) => {
  try {
    const { type, data } = message;
    const { driverId, status, location } = data;
    
    if (!driverId) {
      console.warn('Missing driver ID in driver event');
      return;
    }
    
    if (type === 'DRIVER_STATUS_CHANGED' && status === 'available' && location) {
      console.log(`Driver ${driverId} status changed to ${status}`);
      
      // Find nearby customers within 10km
      const nearbyCustomers = await Customer.find({
        'last_location': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [location.longitude, location.latitude]
            },
            $maxDistance: 10000
          }
        }
      }).select('customer_id').limit(50); // Limit to 50 for performance
      
      console.log(`Notifying ${nearbyCustomers.length} nearby customers about available driver`);
      
 
      if (nearbyCustomers.length > 0) {
        // Batch invalidate customer caches
        await invalidateCache(`*customer*`);
      }
    }
    
    // Always invalidate driver cache
    await invalidateCache(`*driver*${driverId}*`);
    
  } catch (error) {
    console.error(`Error handling driver event: ${error.message}`);
  }
};

// Handler for customer_events topic - optimized
const handleCustomerEvent = async (message) => {
  try {
    const { type, data } = message;
    const { customerId } = data;
    
    if (!customerId) {
      console.warn('Missing customer ID in customer event');
      return;
    }
    
    // Handle specific event types
    switch (type) {
      case 'CUSTOMER_LOCATION_UPDATED':
        console.log(`Customer ${customerId} location updated`);
        
        // Find nearby drivers if customer is looking for a ride
        if (data.lookingForRide && data.location) {
          const location = data.location;
          
          // Find available drivers within 10km
          const nearbyDrivers = await Driver.find({
            'intro_media.location': {
              $near: {
                $geometry: {
                  type: 'Point',
                  coordinates: [location.longitude, location.latitude]
                },
                $maxDistance: 10000
              }
            },
            status: 'available'
          })
          .select('driver_id first_name last_name car_details rating')
          .limit(20); // Limit to 20 for performance
          
          console.log(`Found ${nearbyDrivers.length} drivers near customer ${customerId}`);
          
          // Cache these results for quick access (60 seconds)
          if (nearbyDrivers.length > 0) {
            await redisClient.set(
              `nearby_drivers:${customerId}`,
              JSON.stringify(nearbyDrivers),
              'EX',
              60
            );
          }
        }
        break;
        
      default:
        // For other event types, just log them
        console.log(`Processed customer event type: ${type} for customer ${customerId}`);
    }
    
    // Invalidate customer-specific cache
    await invalidateCache(`*customer*${customerId}*`);
    
  } catch (error) {
    console.error(`Error handling customer event: ${error.message}`);
  }
};

// Initialize Kafka with optimized connection handling
const initKafka = async () => {
  try {
    // Connect producer with retry logic
    let producerConnected = false;
    let attempts = 0;
    
    while (!producerConnected && attempts < 5) {
      try {
        await producer.connect();
        producerConnected = true;
        console.log('Kafka producer connected');
      } catch (error) {
        attempts++;
        console.error(`Kafka producer connection attempt ${attempts} failed:`, error);
        
        if (attempts >= 5) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
      }
    }
    
    // Connect consumer with retry logic
    let consumerConnected = false;
    attempts = 0;
    
    while (!consumerConnected && attempts < 5) {
      try {
        await consumer.connect();
        consumerConnected = true;
        console.log('Kafka consumer connected');
      } catch (error) {
        attempts++;
        console.error(`Kafka consumer connection attempt ${attempts} failed:`, error);
        
        if (attempts >= 5) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
      }
    }
    
    // Subscribe to topics
    await consumer.subscribe({ 
      topics: [
        'ride_requests',
        'ride_responses',
        'billing_events',
        'driver_events',
        'customer_events'
      ],
      fromBeginning: false
    });
    
    // Start consuming messages with optimized batch processing
    await consumer.run({
      partitionsConsumedConcurrently: 3, // Process multiple partitions concurrently
      eachBatchAutoResolve: true,
      eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
        for (let message of batch.messages) {
          try {
            const messageValue = JSON.parse(message.value.toString());
            console.log(`Received batch message from topic ${batch.topic}`);
            
            // Process message based on topic
            switch (batch.topic) {
              case 'ride_requests':
                await handleRideRequest(messageValue);
                break;
              case 'ride_responses':
                await handleRideResponse(messageValue);
                break;
              case 'billing_events':
                await handleBillingEvent(messageValue);
                break;
              case 'driver_events':
                await handleDriverEvent(messageValue);
                break;
              case 'customer_events':
                await handleCustomerEvent(messageValue);
                break;
              case 'ride_cancellations':
                await handleRideCancellation(messageValue);
                break;
              default:
                console.log(`No handler for topic ${batch.topic}`);
            }
            
            // Mark message as processed
            resolveOffset(message.offset);
            
            // Send heartbeat periodically to keep connection alive
            await heartbeat();
          } catch (error) {
            console.error(`Error processing Kafka message from topic ${batch.topic}:`, error);
          }
        }
      },
    });
  } catch (error) {
    console.error('Error connecting to Kafka:', error);
    
    // Set up reconnection logic
    console.log('Scheduling Kafka reconnection in 10 seconds...');
    setTimeout(() => initKafka(), 10000);
  }
};

// Export the functions
module.exports = {
  kafka,
  producer,
  consumer,
  initKafka,
  sendMessage
};