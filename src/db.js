import couchbase from "couchbase";

let cluster, bucket, collection;

export async function connectCouchbase() {
  if (collection) return collection;
  try {
    if (!cluster) {
      cluster = await couchbase.connect(
        "couchbases://cb.lxqnwhymch8dkz2a.cloud.couchbase.com",
        {
          username: "sahelip",
          password: "noJ@twOVH1D%",
        }
      );
      console.log("✅ Couchbase cluster connected");
    }

    if (!bucket) {
      bucket = cluster.bucket("users"); 
      console.log("✅ Couchbase bucket selected: users");
    }

    collection = bucket.defaultCollection();
    return collection;
  } catch (err) {
    console.error("❌ Couchbase connection failed:", err);
    throw err;
  }
}

// Helper function to create user indexes (call this once during setup)
export async function createUserIndexes() {
  try {
    const query = `
      CREATE INDEX idx_user_type ON users(type) WHERE type = 'user';
      CREATE INDEX idx_user_email ON users(email) WHERE type = 'user';
      CREATE INDEX idx_user_username ON users(username) WHERE type = 'user';
    `;
    
    await cluster.query(query);
    console.log("✅ User indexes created successfully");
  } catch (error) {
    // Indexes might already exist
    if (!error.message.includes('already exists')) {
      console.error("❌ Error creating indexes:", error);
    }
  }
}

// Helper function to get user by email
export async function getUserByEmail(email) {
  try {
    const query = `
      SELECT META().id, * FROM users 
      WHERE type = 'user' AND email = $1
    `;
    
    const result = await cluster.query(query, [email]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error getting user by email:", error);
    throw error;
  }
}

// Helper function to update user last login
export async function updateUserLastLogin(username) {
  try {
    const userDoc = await collection.get(`user::${username}`);
    const userData = userDoc.content;
    
    userData.lastLogin = new Date().toISOString();
    userData.updatedAt = new Date().toISOString();
    
    await collection.replace(`user::${username}`, userData);
    return userData;
  } catch (error) {
    console.error("Error updating last login:", error);
    throw error;
  }
}
