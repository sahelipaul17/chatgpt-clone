import { connectCouchbase, createUserIndexes } from '../src/db.js';

async function setup() {
  try {
    console.log('🚀 Setting up ChatGPT Clone...');
    
    // Connect to Couchbase
    await connectCouchbase();
    console.log('✅ Connected to Couchbase');
    
    // Create indexes
    await createUserIndexes();
    console.log('✅ Database indexes created');
    
    console.log('🎉 Setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

setup();
