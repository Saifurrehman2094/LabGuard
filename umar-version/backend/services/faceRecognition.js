const DatabaseService = require('./database');

class FaceRecognitionService {
    constructor(dbService = null) {
        this.dbService = dbService || new DatabaseService();
        this.defaultThreshold = 0.45; // Default matching threshold
        this.currentThreshold = this.defaultThreshold;
        this.embeddingDimension = 128; // Face-api.js embedding dimension
    }

    /**
     * Initialize the face recognition service
     */
    async initialize() {
        try {
            if (!this.dbService.db) {
                await this.dbService.initializeDatabase();
            }

            // Load matching threshold from database settings
            const threshold = this.dbService.getSystemSetting('face_matching_threshold');
            if (threshold !== null) {
                this.currentThreshold = threshold;
            }

            console.log('Face recognition service initialized with threshold:', this.currentThreshold);
            return true;
        } catch (error) {
            console.error('Face recognition service initialization error:', error);
            throw error;
        }
    }

    /**
     * Store face embedding for a user
     */
    async storeFaceEmbedding(userId, embedding, confidenceScore = null) {
        try {
            // Validate embedding
            if (!this.validateEmbedding(embedding)) {
                throw new Error('Invalid face embedding format');
            }

            // Store in database
            const result = await this.dbService.storeFaceEmbedding(userId, embedding, confidenceScore);

            // Log audit event
            this.dbService.logAuditEvent(userId, 'FACE_EMBEDDING_STORED', {
                embeddingId: result.embeddingId,
                confidenceScore
            });

            return result;
        } catch (error) {
            console.error('Error storing face embedding:', error);
            throw error;
        }
    }

    /**
     * Verify face against stored embedding
     */
    async verifyFace(userId, capturedEmbedding) {
        try {
            // Validate captured embedding
            if (!this.validateEmbedding(capturedEmbedding)) {
                throw new Error('Invalid captured face embedding format');
            }

            // Get stored embedding from database
            const storedEmbeddingData = this.dbService.getFaceEmbedding(userId);

            if (!storedEmbeddingData) {
                // Log failed verification attempt
                this.dbService.logAuditEvent(userId, 'FACE_VERIFICATION_FAILED', {
                    reason: 'No stored embedding found'
                });

                return {
                    verified: false,
                    distance: null,
                    threshold: this.currentThreshold,
                    reason: 'No face data registered for this user'
                };
            }

            // Calculate distance between embeddings
            const distance = this.calculateDistance(storedEmbeddingData.embedding_data, capturedEmbedding);
            const verified = distance < this.currentThreshold;

            // Log verification attempt
            this.dbService.logAuditEvent(userId, verified ? 'FACE_VERIFICATION_SUCCESS' : 'FACE_VERIFICATION_FAILED', {
                distance,
                threshold: this.currentThreshold,
                storedEmbeddingId: storedEmbeddingData.embedding_id
            });

            return {
                verified,
                distance,
                threshold: this.currentThreshold,
                confidence: storedEmbeddingData.confidence_score,
                reason: verified ? 'Face verified successfully' : 'Face does not match stored data'
            };
        } catch (error) {
            console.error('Error verifying face:', error);

            // Log error
            this.dbService.logAuditEvent(userId, 'FACE_VERIFICATION_ERROR', {
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Calculate Euclidean distance between two embeddings
     */
    calculateDistance(embedding1, embedding2) {
        try {
            if (embedding1.length !== embedding2.length) {
                throw new Error('Embedding dimensions do not match');
            }

            let sum = 0;
            for (let i = 0; i < embedding1.length; i++) {
                const diff = embedding1[i] - embedding2[i];
                sum += diff * diff;
            }

            return Math.sqrt(sum);
        } catch (error) {
            console.error('Error calculating embedding distance:', error);
            throw error;
        }
    }

    /**
     * Average multiple embeddings for improved accuracy
     */
    averageEmbeddings(embeddings) {
        try {
            if (!embeddings || embeddings.length === 0) {
                throw new Error('No embeddings provided for averaging');
            }

            if (embeddings.length === 1) {
                return embeddings[0];
            }

            const dimension = embeddings[0].length;
            const averaged = new Array(dimension).fill(0);

            // Sum all embeddings
            for (const embedding of embeddings) {
                if (embedding.length !== dimension) {
                    throw new Error('All embeddings must have the same dimension');
                }

                for (let i = 0; i < dimension; i++) {
                    averaged[i] += embedding[i];
                }
            }

            // Calculate average
            for (let i = 0; i < dimension; i++) {
                averaged[i] /= embeddings.length;
            }

            return averaged;
        } catch (error) {
            console.error('Error averaging embeddings:', error);
            throw error;
        }
    }

    /**
     * Validate embedding format and dimensions
     */
    validateEmbedding(embedding) {
        try {
            if (!Array.isArray(embedding)) {
                return false;
            }

            if (embedding.length !== this.embeddingDimension) {
                console.warn(`Expected embedding dimension ${this.embeddingDimension}, got ${embedding.length}`);
                // Allow different dimensions but log warning
            }

            // Check if all elements are numbers
            for (const value of embedding) {
                if (typeof value !== 'number' || isNaN(value)) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error validating embedding:', error);
            return false;
        }
    }

    /**
     * Set matching threshold
     */
    setMatchingThreshold(threshold) {
        try {
            if (typeof threshold !== 'number' || threshold < 0 || threshold > 2) {
                throw new Error('Threshold must be a number between 0 and 2');
            }

            this.currentThreshold = threshold;

            // Store in database settings
            this.dbService.setSystemSetting('face_matching_threshold', threshold, 'number', 'Face recognition matching threshold');

            console.log('Face matching threshold updated to:', threshold);
            return true;
        } catch (error) {
            console.error('Error setting matching threshold:', error);
            throw error;
        }
    }

    /**
     * Get current matching threshold
     */
    getMatchingThreshold() {
        return this.currentThreshold;
    }

    /**
     * Delete face embedding for a user
     */
    async deleteFaceEmbedding(userId) {
        try {
            const result = this.dbService.deleteFaceEmbedding(userId);

            if (result) {
                // Log audit event
                this.dbService.logAuditEvent(userId, 'FACE_EMBEDDING_DELETED');
            }

            return result;
        } catch (error) {
            console.error('Error deleting face embedding:', error);
            throw error;
        }
    }

    /**
     * Check if user has registered face data
     */
    hasRegisteredFace(userId) {
        try {
            // Check the has_registered_face flag in users table
            const user = this.dbService.getUserById(userId);
            console.log('hasRegisteredFace check - userId:', userId, 'user found:', !!user, 'has_registered_face:', user?.has_registered_face);
            return user && user.has_registered_face === 1;
        } catch (error) {
            console.error('Error checking face registration:', error);
            return false;
        }
    }

    /**
     * Get face registration statistics
     */
    getFaceRegistrationStats() {
        try {
            const totalUsers = this.dbService.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
            const registeredUsers = this.dbService.db.prepare('SELECT COUNT(*) as count FROM users WHERE has_registered_face = 1').get().count;

            return {
                totalUsers,
                registeredUsers,
                unregisteredUsers: totalUsers - registeredUsers,
                registrationRate: totalUsers > 0 ? (registeredUsers / totalUsers * 100).toFixed(2) : 0
            };
        } catch (error) {
            console.error('Error getting face registration stats:', error);
            throw error;
        }
    }

    /**
     * Batch process multiple face embeddings for a user (for registration)
     */
    async registerUserFaceWithMultipleCaptures(userId, embeddings, confidenceScores = []) {
        try {
            if (!embeddings || embeddings.length === 0) {
                throw new Error('No embeddings provided for registration');
            }

            // Validate all embeddings
            for (const embedding of embeddings) {
                if (!this.validateEmbedding(embedding)) {
                    throw new Error('One or more embeddings are invalid');
                }
            }

            // Average the embeddings for better accuracy
            const averagedEmbedding = this.averageEmbeddings(embeddings);

            // Calculate average confidence score
            const avgConfidence = confidenceScores.length > 0
                ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
                : null;

            // Store the averaged embedding
            const result = await this.storeFaceEmbedding(userId, averagedEmbedding, avgConfidence);

            // Log registration with details
            this.dbService.logAuditEvent(userId, 'FACE_REGISTRATION_COMPLETED', {
                embeddingCount: embeddings.length,
                averageConfidence: avgConfidence,
                embeddingId: result.embeddingId
            });

            return {
                ...result,
                embeddingCount: embeddings.length,
                averageConfidence: avgConfidence
            };
        } catch (error) {
            console.error('Error registering user face with multiple captures:', error);

            // Log registration failure
            this.dbService.logAuditEvent(userId, 'FACE_REGISTRATION_FAILED', {
                error: error.message,
                embeddingCount: embeddings ? embeddings.length : 0
            });

            throw error;
        }
    }

    /**
     * Close the service and cleanup resources
     */
    close() {
        if (this.dbService) {
            this.dbService.close();
        }
    }
}

module.exports = FaceRecognitionService;