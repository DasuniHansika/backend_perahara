
const { getAuth, admin } = require('./firebase');
const { query } = require('./database-schema');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};



const sendVerificationEmail = async (firebaseUser) => {
  try {
    if (!firebaseUser.email) {
      logger.warn(`No email address for user ${firebaseUser.uid}, skipping verification`);
      return false;
    }

    // Get user role and details from database
    let userRole = 'seller';
    let userDetails = null;
    let userId = null;
    
    try {
      const userData = await query(
        `SELECT 
          u.user_id, u.role, u.username, u.email,
          s.seller_id, s.first_name, s.last_name,
          c.customer_id, c.first_name as customer_first_name, c.last_name as customer_last_name
        FROM users u 
        LEFT JOIN sellers s ON u.user_id = s.user_id 
        LEFT JOIN customers c ON u.user_id = c.user_id 
        WHERE u.firebase_uid = ?`,
        [firebaseUser.uid]
      );
      
      if (userData.length > 0) {
        userRole = userData[0].role;
        userId = userData[0].user_id;
        
        if (userRole === 'seller' && userData[0].seller_id) {
          userDetails = {
            type: 'seller',
            id: userData[0].seller_id,
            firstName: userData[0].first_name,
            lastName: userData[0].last_name
          };
        } else if (userRole === 'customer' && userData[0].customer_id) {
          userDetails = {
            type: 'customer',
            id: userData[0].customer_id,
            firstName: userData[0].customer_first_name,
            lastName: userData[0].customer_last_name
          };
        }
      }
    } catch (dbError) {
      logger.error('Error fetching user details:', dbError);
    }

    const actionCodeSettings = {
      url: process.env.EMAIL_VERIFICATION_REDIRECT_URL || 
           "http://localhost:3000/email-verified",
      handleCodeInApp: false,
    };

    // Generate verification link
    const link = await admin
      .auth()
      .generateEmailVerificationLink(firebaseUser.email, actionCodeSettings);

    // Format user ID with leading zeros (PG-000123)
    const formattedUserId = `PG-${String(userId).padStart(6, '0')}`;

    // Email template with improved design
    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #2d3748; margin: 0;">Perahera Gallery</h1>
        </div>
        
        <div style="background-color: white; padding: 25px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
          <h2 style="color: #2d3748; margin-top: 0; border-bottom: 2px solid #f0f0f0; padding-bottom: 15px;">
            Welcome to Perahera Gallery!
          </h2>
          
          <div style="margin-bottom: 20px;">
            <p style="font-size: 16px; color: #4a5568;">
              Thank you for registering with Perahera Gallery. Your account has been successfully created.
            </p>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 14px;">
                <strong style="color: #4a5568; min-width: 120px; display: inline-block;">Account ID:</strong>
                <span style="color: #2d3748; font-weight: 600;">${formattedUserId}</span>
              </p>
              ${userDetails ? `
                <p style="margin: 5px 0; font-size: 14px;">
                  <strong style="color: #4a5568; min-width: 120px; display: inline-block;">Name:</strong>
                  <span style="color: #2d3748; font-weight: 600;">${userDetails.firstName} ${userDetails.lastName}</span>
                </p>
              ` : ''}
            </div>
            
            <p style="font-size: 16px; color: #4a5568;">
              Please verify your email address to complete your registration:
            </p>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${link}" 
                 style="display: inline-block; padding: 12px 30px; background-color: #4299e1; 
                        color: white; text-decoration: none; border-radius: 4px; font-weight: 600;
                        box-shadow: 0 2px 5px rgba(66, 153, 225, 0.3);">
                Verify Email Address
              </a>
            </div>
            
            <p style="font-size: 14px; color: #718096;">
              If you didn't request this, please ignore this email or contact support if you have concerns.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 25px; color: #a0aec0; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Perahera Gallery. All rights reserved.</p>
          <p>This email was sent to ${firebaseUser.email}</p>
        </div>
      </div>
    `;

    // Plain text version
    const emailText = `
      Welcome to Perahera Gallery!
      
      Thank you for registering with Perahera Gallery. Your account has been successfully created.
      
      Account Details:
      - Account ID: ${formattedUserId}
      ${userDetails ? `
      - Name: ${userDetails.firstName} ${userDetails.lastName}
      ` : ''}
      
      Please verify your email address by visiting this link:
      ${link}
      
      If you didn't request this, please ignore this email.
      
      © ${new Date().getFullYear()} Perahera Gallery. All rights reserved.
    `;

    // Send email
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Perahera Gallery'}" <${process.env.EMAIL_FROM_ADDRESS || 'noreply@peraheragallery.com'}>`,
      to: firebaseUser.email,
      subject: process.env.EMAIL_VERIFICATION_SUBJECT || 'Verify Your Email Address - Perahera Gallery',
      html: emailHtml,
      text: emailText
    });

    logger.info(`Verification email sent to ${firebaseUser.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send verification email to ${firebaseUser.email}:`, error);
    return false;
  }
};

// const sendVerificationEmail = async (firebaseUser) => {
//   try {
//     if (!firebaseUser.email) {
//       logger.warn(`No email address for user ${firebaseUser.uid}, skipping verification`);
//       return false;
//     }

//     // Get user role and details from database
//     let userRole = 'seller';
//     let userDetails = null;
//     let userId = null;
    
//     try {
//       const userData = await query(
//         `SELECT 
//           u.user_id, u.role, u.username, u.email,
//           s.seller_id, s.first_name, s.last_name,
//           c.customer_id, c.first_name as customer_first_name, c.last_name as customer_last_name
//         FROM users u 
//         LEFT JOIN sellers s ON u.user_id = s.user_id 
//         LEFT JOIN customers c ON u.user_id = c.user_id 
//         WHERE u.firebase_uid = ?`,
//         [firebaseUser.uid]
//       );
      
//       if (userData.length > 0) {
//         userRole = userData[0].role;
//         userId = userData[0].user_id;
        
//         if (userRole === 'seller' && userData[0].seller_id) {
//           userDetails = {
//             type: 'seller',
//             id: userData[0].seller_id,
//             firstName: userData[0].first_name,
//             lastName: userData[0].last_name
//           };
//         } else if (userRole === 'customer' && userData[0].customer_id) {
//           userDetails = {
//             type: 'customer',
//             id: userData[0].customer_id,
//             firstName: userData[0].customer_first_name,
//             lastName: userData[0].customer_last_name
//           };
//         }
//       }
//     } catch (dbError) {
//       logger.error('Error fetching user details:', dbError);
//     }

//     const actionCodeSettings = {
//       url: process.env.EMAIL_VERIFICATION_REDIRECT_URL || 
//            "http://localhost:3000/email-verified",
//       handleCodeInApp: false,
//     };

//     // Generate verification link
//     const link = await admin
//       .auth()
//       .generateEmailVerificationLink(firebaseUser.email, actionCodeSettings);

//     // Format user ID with leading zeros (PG-000123)
//     const formattedUserId = `PG-${String(userId).padStart(6, '0')}`;

//     // Email template with improved design
//     const emailHtml = `
//       <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px; border-radius: 8px;">
//         <div style="text-align: center; margin-bottom: 25px;">
//           <h1 style="color: #2d3748; margin: 0;">Perahera Gallery</h1>
//         </div>
        
//         <div style="background-color: white; padding: 25px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
//           <h2 style="color: #2d3748; margin-top: 0; border-bottom: 2px solid #f0f0f0; padding-bottom: 15px;">
//             Welcome to Perahera Gallery!
//           </h2>
          
//           <div style="margin-bottom: 20px;">
//             <p style="font-size: 16px; color: #4a5568;">
//               Thank you for registering with Perahera Gallery. Your account has been successfully created.
//             </p>
            
//             <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
//               <p style="margin: 5px 0; font-size: 14px;">
//                 <strong style="color: #4a5568; min-width: 120px; display: inline-block;">Account ID:</strong>
//                 <span style="color: #2d3748; font-weight: 600;">${formattedUserId}</span>
//               </p>
//               <p style="margin: 5px 0; font-size: 14px;">
//                 <strong style="color: #4a5568; min-width: 120px; display: inline-block;">Account Type:</strong>
//                 <span style="color: #2d3748; font-weight: 600; text-transform: capitalize;">${userRole}</span>
//               </p>
//               ${userDetails ? `
//                 <p style="margin: 5px 0; font-size: 14px;">
//                   <strong style="color: #4a5568; min-width: 120px; display: inline-block;">${userDetails.type === 'seller' ? 'Seller ID' : 'Customer ID'}:</strong>
//                   <span style="color: #2d3748; font-weight: 600;">${userDetails.id}</span>
//                 </p>
//                 <p style="margin: 5px 0; font-size: 14px;">
//                   <strong style="color: #4a5568; min-width: 120px; display: inline-block;">Name:</strong>
//                   <span style="color: #2d3748; font-weight: 600;">${userDetails.firstName} ${userDetails.lastName}</span>
//                 </p>
//               ` : ''}
//             </div>
            
//             <p style="font-size: 16px; color: #4a5568;">
//               Please verify your email address to complete your registration:
//             </p>
            
//             <div style="text-align: center; margin: 25px 0;">
//               <a href="${link}" 
//                  style="display: inline-block; padding: 12px 30px; background-color: #4299e1; 
//                         color: white; text-decoration: none; border-radius: 4px; font-weight: 600;
//                         box-shadow: 0 2px 5px rgba(66, 153, 225, 0.3);">
//                 Verify Email Address
//               </a>
//             </div>
            
//             <p style="font-size: 14px; color: #718096;">
//               If you didn't request this, please ignore this email or contact support if you have concerns.
//             </p>
//           </div>
//         </div>
        
//         <div style="text-align: center; margin-top: 25px; color: #a0aec0; font-size: 12px;">
//           <p>© ${new Date().getFullYear()} Perahera Gallery. All rights reserved.</p>
//           <p>This email was sent to ${firebaseUser.email}</p>
//         </div>
//       </div>
//     `;

//     // Plain text version
//     const emailText = `
//       Welcome to Perahera Gallery!
      
//       Thank you for registering with Perahera Gallery. Your account has been successfully created.
      
//       Account Details:
//       - Account ID: ${formattedUserId}
//       - Account Type: ${userRole}
//       ${userDetails ? `
//       - ${userDetails.type === 'seller' ? 'Seller ID' : 'Customer ID'}: ${userDetails.id}
//       - Name: ${userDetails.firstName} ${userDetails.lastName}
//       ` : ''}
      
//       Please verify your email address by visiting this link:
//       ${link}
      
//       If you didn't request this, please ignore this email.
      
//       © ${new Date().getFullYear()} Perahera Gallery. All rights reserved.
//     `;

//     // Send email
//     await transporter.sendMail({
//       from: `"${process.env.EMAIL_FROM_NAME || 'Perahera Gallery'}" <${process.env.EMAIL_FROM_ADDRESS || 'noreply@peraheragallery.com'}>`,
//       to: firebaseUser.email,
//       subject: process.env.EMAIL_VERIFICATION_SUBJECT || 'Verify Your Email Address - Perahera Gallery',
//       html: emailHtml,
//       text: emailText
//     });

//     logger.info(`Verification email sent to ${firebaseUser.email}`);
//     return true;
//   } catch (error) {
//     logger.error(`Failed to send verification email to ${firebaseUser.email}:`, error);
//     return false;
//   }
// };
const syncUserToDatabase = async (firebaseUser) => {
  const { uid, email, displayName, phoneNumber, emailVerified } = firebaseUser;
  const username = displayName || email?.split('@')[0] || `user_${uid.substring(0, 8)}`;
  const role = 'customer'; // Default role for new users

  try {
    // Check if user already exists
    const existingUser = await query(
      "SELECT user_id FROM users WHERE firebase_uid = ?",
      [uid]
    );

    if (existingUser.length > 0) {
      logger.warn(`User ${uid} already exists in database`);
      return existingUser[0].user_id;
    }

    // Create user in database
    const result = await query(
      "INSERT INTO users (firebase_uid, username, email, role, mobile_number) VALUES (?, ?, ?, ?, ?)",
      [uid, username, email, role, phoneNumber || null]
    );

    const userId = result.insertId;
    
    // Create customer profile
    await query(
      "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
      [userId, username.split(' ')[0] || 'User', username.split(' ')[1] || 'Name']
    );

    logger.info(`Created user ${userId} for Firebase UID ${uid}`);

    // Send verification email if needed
    if (email && !emailVerified) {
      await sendVerificationEmail(firebaseUser);
    }

    return userId;
  } catch (error) {
    logger.error(`Error syncing user ${uid}:`, error);
    throw error;
  }
};

const initializeAuthSync = () => {
  try {
    const auth = getAuth();
    
    // Polling implementation for user changes
    let lastCheckTime = new Date();
    
    const checkForChanges = async () => {
      try {
        const now = new Date();
        // Get users created since last check
        const listUsersResult = await auth.listUsers(1000, lastCheckTime.toISOString());
        
        for (const user of listUsersResult.users) {
          try {
            await syncUserToDatabase(user);
            logger.info(`Synced new user: ${user.uid}`);
          } catch (syncError) {
            logger.error(`Failed to sync user ${user.uid}:`, syncError);
          }
        }
        
        lastCheckTime = now;
      } catch (error) {
        logger.error('Error checking for user changes:', error);
      }
      
      // Check again in 30 seconds
      setTimeout(checkForChanges, 30000);
    };
    
    // Start polling
    checkForChanges();
    logger.info("Firebase Auth sync initialized (polling every 30 seconds)");
    return true;
  } catch (error) {
    logger.error("Error initializing Firebase Auth sync:", error);
    return false;
  }
};

module.exports = {
  initializeAuthSync,
  syncUserToDatabase,
  sendVerificationEmail
};