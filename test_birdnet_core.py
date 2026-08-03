import unittest
from unittest.mock import patch, mock_open
import os
import io

# Import the core backend functions for testing
import birdnet_core

class TestBirdNETCore(unittest.TestCase):
    
    @patch('os.path.exists')
    def test_get_config_missing_file(self, mock_exists):
        """Test get_config when birdnet.conf does not exist."""
        mock_exists.return_value = False
        config = birdnet_core.get_config()
        self.assertEqual(config.get('APPRISE_SERVICES'), '')
        self.assertEqual(config.get('APPRISE_NOTIFICATION_BODY'), '')

    @patch('os.path.exists')
    def test_get_config_success(self, mock_exists):
        """Test get_config when birdnet.conf exists and has valid values."""
        mock_exists.return_value = True
        mock_data = (
            "# This is a comment\n"
            "LATITUDE=41.90\n"
            "LONGITUDE=-73.10\n"
            "CONFIDENCE=\"0.75\"\n"
            "OVERLAP='0.5'\n"
        )
        with patch('builtins.open', mock_open(read_data=mock_data)):
            config = birdnet_core.get_config()
            self.assertEqual(config.get('LATITUDE'), '41.90')
            self.assertEqual(config.get('LONGITUDE'), '-73.10')
            self.assertEqual(config.get('CONFIDENCE'), '0.75')
            self.assertEqual(config.get('OVERLAP'), '0.5')

    @patch('os.path.exists')
    def test_update_config(self, mock_exists):
        """Test updating a configuration file with new settings."""
        mock_exists.return_value = True
        mock_data = (
            "LATITUDE=41.90\n"
            "LONGITUDE=-73.10\n"
            "CONFIDENCE=\"0.75\"\n"
        )
        
        m_open = mock_open(read_data=mock_data)
        with patch('builtins.open', m_open):
            updates = {"LATITUDE": "42.50", "CONFIDENCE": "0.85"}
            success = birdnet_core.update_config(updates)
            
            self.assertTrue(success)
            
            # Gather all write calls
            written = "".join(call.args[0] for call in m_open().write.call_args_list)
            self.assertIn('LATITUDE=42.50\n', written)
            self.assertIn('CONFIDENCE=0.85\n', written)
            self.assertIn('LONGITUDE=-73.10\n', written) # Unchanged field should be preserved

    @patch('os.path.exists')
    def test_get_db_path_selection(self, mock_exists):
        """Test that get_db_path selects the first path that exists."""
        # Setup SidecarHandler instance
        handler = birdnet_core.SidecarHandler
        
        # We mock exists to return True when checking the first path
        def side_effect(path):
            return "BirdNET-Pi" in path and "birds.db" in path

        mock_exists.side_effect = side_effect
        db_path = handler.get_db_path(handler)
        self.assertIsNotNone(db_path)
        self.assertTrue(db_path.endswith("BirdNET-Pi/birds.db") or db_path.endswith("BirdNET-Pi\\birds.db"))

if __name__ == '__main__':
    unittest.main()
