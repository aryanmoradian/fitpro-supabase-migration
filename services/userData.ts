
import { supabase } from "../supabaseConfig";
import { UserProfile, TraineeData, VideoFeedbackLog, PaymentRequest } from "../types";

// --- HELPERS: Map DB Snake_Case to App CamelCase ---

const mapProfileFromDB = (data: any): UserProfile => ({
    id: data.id,
    email: data.email,
    name: data.full_name || data.email?.split('@')[0] || 'User',
    role: data.role || 'Guest',
    avatarUrl: data.avatar_url,
    
    // Application specific mapping
    subscriptionTier: data.subscription_tier || 'Free',
    subscriptionStatus: data.subscription_status || 'Active',
    subscriptionExpiryDate: data.subscription_expiry_date,
    verificationStatus: data.verification_status || 'Pending',
    
    // JSONB Fields (assuming they are stored as jsonb in DB or mapped)
    measurements: data.measurements || [], 
    settings: data.settings || {},
    customExercises: data.custom_exercises || [],
    
    // Legacy mapping
    certUrl: data.avatar_url, 
    phoneNumber: data.phone_number
});

const mapProfileToDB = (profile: UserProfile) => {
    return {
        id: profile.id,
        email: profile.email,
        full_name: profile.name,
        role: profile.role,
        avatar_url: profile.avatarUrl || profile.certUrl,
        phone_number: profile.phoneNumber,
        
        subscription_tier: profile.subscriptionTier,
        subscription_status: profile.subscriptionStatus,
        subscription_expiry_date: profile.subscriptionExpiryDate,
        verification_status: profile.verificationStatus,
        
        measurements: profile.measurements,
        settings: profile.settings,
        custom_exercises: profile.customExercises
    };
};

// --- PROFILE SERVICES ---

export const fetchUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        console.error("Supabase profile fetch error:", error.message);
        return null; 
    }
    return mapProfileFromDB(data);
  } catch (error) {
    console.error("Unexpected error fetching profile:", error);
    return null;
  }
};

export const saveUserProfile = async (profile: UserProfile) => {
  try {
    if (!profile.id) throw new Error("User ID is missing");
    
    const dbData = mapProfileToDB(profile);
    
    const { error } = await supabase
      .from('profiles')
      .upsert(dbData, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    console.error("Error saving user profile:", error);
    throw error;
  }
};

export const updateCoachVerificationStatus = async (userId: string, status: 'Verified' | 'Rejected' | 'Pending') => {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ verification_status: status })
            .eq('id', userId);

        if (error) throw error;
    } catch (error) {
        console.error("Error updating verification status:", error);
        throw error;
    }
};

// --- STORAGE & DOCUMENTS SERVICES ---

/**
 * Uploads a file to Supabase Storage and inserts a record into the 'documents' table.
 */
export const uploadCertification = async (uid: string, file: File): Promise<string> => {
    try {
        const timestamp = Date.now();
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const filePath = `certifications/${uid}/${timestamp}_${cleanName}`;

        // 1. Upload to 'documents' bucket
        const { error: uploadError } = await supabase.storage
            .from('documents') 
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
        const publicUrl = data.publicUrl;

        // 3. Insert into 'documents' table
        const { error: dbError } = await supabase
            .from('documents')
            .insert({
                coach_id: uid,
                file_url: publicUrl,
                status: 'pending'
            });

        if (dbError) throw dbError;

        return publicUrl;
    } catch (error) {
        console.error("Error uploading certification:", error);
        throw error;
    }
};

export const uploadWorkoutVideo = async (uid: string, file: File): Promise<string> => {
    try {
        // Reuse 'documents' bucket for video uploads or a separate 'videos' bucket if exists
        const bucketName = 'documents'; 
        const timestamp = Date.now();
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const filePath = `workout_videos/${uid}/${timestamp}_${cleanName}`;
        
        const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        return data.publicUrl;
    } catch (error) {
        console.error("Error uploading video:", error);
        throw error;
    }
};

// --- TRAINEE DATA SERVICES (JSON/NO-SQL Style) ---

// Assuming 'trainee_data' is a table or we store this in 'profiles' -> 'measurements'/'logs'
// For this migration, if you don't have a dedicated table, you might rely on the 'measurements' JSONB column in profiles
// or create a new table. Here we attempt to fetch from a hypothetical structure or fallback.

export const fetchUserData = async (uid: string): Promise<TraineeData | null> => {
    // If you don't have a specific table for logs, return basic structure
    // or expand the 'profiles' table to hold this JSON.
    return { workoutLogs: [], wellnessLogs: [], nutritionLogs: [] };
};

export const saveUserData = async (uid: string, data: Partial<TraineeData>) => {
    // Placeholder: Implement according to where you want to store huge JSON logs.
    // Ideally, create a 'logs' table.
    console.log("Saving trainee data...", data);
};

export const saveVideoFeedback = async (uid: string, feedback: VideoFeedbackLog) => {
    console.log("Saving video feedback:", feedback);
};

export const completeOnboarding = async (uid: string) => {
    // Update profile to set hasSeenDashboardTour = true (if column exists or in settings json)
    const { data } = await supabase.from('profiles').select('settings').eq('id', uid).single();
    const currentSettings = data?.settings || {};
    
    await supabase.from('profiles').update({
        settings: { ...currentSettings, hasSeenDashboardTour: true }
    }).eq('id', uid);
};

// --- PAYMENT SERVICES (Using 'transactions' table) ---

export const submitPaymentRequest = async (request: PaymentRequest): Promise<'AUTO_APPROVED' | 'PENDING_REVIEW'> => {
    try {
        // Call Serverless API to keep logic secure
        const response = await fetch('/api/process-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'SUBMIT', requestData: request }),
        });

        if (!response.ok) throw new Error('Payment submission failed');
        const result = await response.json();
        return result.status;
    } catch (error) {
        console.error("Error submitting payment:", error);
        throw error;
    }
};

export const fetchTransactions = async (): Promise<PaymentRequest[]> => {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                profiles:user_id (full_name)
            `)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        return data.map((tx: any) => ({
            id: tx.id,
            userId: tx.user_id,
            userName: tx.profiles?.full_name || 'Unknown',
            months: 1, // Default or store in DB
            amountUSD: tx.amount,
            amountIRR: 0,
            txId: tx.tx_id,
            status: tx.status,
            requestDate: tx.created_at,
            network: 'TRC20'
        }));
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return [];
    }
};

export const processPayment = async (requestId: string, userId: string, status: 'Approved' | 'Rejected', months = 0) => {
    try {
        const response = await fetch('/api/process-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'PROCESS', requestId, userId, status, months }),
        });
        if (!response.ok) throw new Error('Error processing payment via API');
    } catch (error) {
        console.error("Error processing payment:", error);
        throw error;
    }
};

// --- ADMIN SERVICES ---

export const fetchPendingCoaches = async (): Promise<UserProfile[]> => {
    try {
        // Fetch profiles where role is Coach and verification_status is Pending
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'Coach')
            .eq('verification_status', 'Pending');

        if (error) throw error;
        return data.map(mapProfileFromDB);
    } catch (error) {
        console.error("Error fetching pending coaches:", error);
        return [];
    }
};

export const sendEmailNotification = async (type: string, payload: any) => {
    try {
        await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, payload }),
        });
    } catch (error) {
        console.error("Email API Error:", error);
    }
};
