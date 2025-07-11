// services/imgbbService.js
const axios = require("axios");

class ImgBBService {
  constructor() {
    this.apiKey = "e60d2d1faaf485ae71fa7257985231ca";
    this.baseUrl = "https://api.imgbb.com/1/upload";
  }

  /**
   * Upload image to ImgBB
   * @param {string} base64Image - Base64 encoded image data
   * @param {string} imageName - Name for the image (optional)
   * @returns {Promise<Object>} ImgBB response with image URLs
   */
  async uploadImage(base64Image, imageName = null) {
    try {
      // Remove data:image/... prefix if present
      const cleanBase64 = base64Image.replace(
        /^data:image\/[a-z]+;base64,/,
        ""
      );

      const formData = new FormData();
      formData.append("key", this.apiKey);
      formData.append("image", cleanBase64);

      if (imageName) {
        formData.append("name", imageName);
      }

      const response = await axios.post(this.baseUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000, // 30 second timeout
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            id: response.data.data.id,
            url: response.data.data.url,
            display_url: response.data.data.display_url,
            delete_url: response.data.data.delete_url,
            thumb: response.data.data.thumb,
            medium: response.data.data.medium,
          },
        };
      } else {
        throw new Error("ImgBB API returned unsuccessful response");
      }
    } catch (error) {
      console.error(
        "ImgBB upload error:",
        error.response?.data || error.message
      );

      return {
        success: false,
        error:
          error.response?.data?.error?.message ||
          error.message ||
          "Failed to upload image to ImgBB",
      };
    }
  }

  /**
   * Delete image from ImgBB using delete URL
   * @param {string} deleteUrl - The delete URL from previous upload response
   * @returns {Promise<Object>} Deletion result
   */
  async deleteImage(deleteUrl) {
    try {
      if (!deleteUrl) {
        return {
          success: false,
          error: "Delete URL is required",
        };
      }

      const response = await axios.get(deleteUrl, {
        timeout: 10000, // 10 second timeout
      });

      return {
        success: true,
        message: "Image deleted successfully from ImgBB",
      };
    } catch (error) {
      console.error(
        "ImgBB delete error:",
        error.response?.data || error.message
      );

      // Don't fail the entire operation if delete fails
      // Log the error but continue with the update
      return {
        success: false,
        error:
          error.response?.data?.error?.message ||
          error.message ||
          "Failed to delete image from ImgBB",
        warning: "Image deletion failed but operation continued",
      };
    }
  }

  /**
   * Extract delete URL from image URL
   * @param {string} imageUrl - The public image URL
   * @returns {string|null} Delete URL or null if cannot be extracted
   */
  extractDeleteUrl(imageUrl) {
    try {
      // ImgBB delete URLs typically follow pattern: https://ibb.co/delete/[id]/[key]
      // This is a simplified implementation - in practice, you should store the delete_url
      // returned from the upload response in your database

      console.log(
        "Warning: Delete URL extraction not implemented. Store delete_url from upload response in database."
      );
      return null;
    } catch (error) {
      console.error("Error extracting delete URL:", error);
      return null;
    }
  }
}

module.exports = new ImgBBService();
