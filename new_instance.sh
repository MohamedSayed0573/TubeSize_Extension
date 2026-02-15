#!/bin/bash
# This file contains commands to run when you first launch a new EC2 instance.

# STEP 1: Here those commands should run on the new instance
# 1. System Updates (Non-interactive)
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt-get -y upgrade

# 2. Time & Regions
sudo timedatectl set-timezone Africa/Cairo

# 3. Swap Space (Emergency RAM for builds)
if [ ! -f /swapfile ]; then
    sudo dd if=/dev/zero of=/swapfile bs=128M count=16
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
fi

# 4. Tools & Quality of Life
sudo apt install -y htop git curl wget unattended-upgrades

# 5. Automated Security Upgrades (Replacing the Wizard)
echo "unattended-upgrades unattended-upgrades/enable_auto_updates boolean true" | sudo debconf-set-selections
sudo dpkg-reconfigure -plow unattended-upgrades

# 6. Auto-Cleanup of old updates (Replacing nano)
# This uses 'sed' to automatically uncomment and set values to true
sudo sed -i 's/\/\/Unattended-Upgrade::Remove-Unused-Dependencies "false";/Unattended-Upgrade::Remove-Unused-Dependencies "true";/' /etc/apt/apt.conf.d/50unattended-upgrades
sudo sed -i 's/\/\/Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";/Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";/' /etc/apt/apt.conf.d/50unattended-upgrades

# 7. Install Docker (Standard Ubuntu method)
sudo apt install -y apt-transport-https ca-certificates software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker

# 8. User Permissions
sudo usermod -aG docker $USER

echo "------------------------------------------------"
echo "PHASE 1 COMPLETE!"
echo "1. Run 'newgrp docker' to apply permissions now."
echo "2. Upload your .env and cookies.txt from your laptop."
echo "3. Run your git clone and Docker build commands."
echo "------------------------------------------------"
# Clone the repository
git clone https://github.com/MohamedSayed0573/yt-dlp-API.git

# Navigate to the directory
cd yt-dlp-API

# STEP 2: Here those commands should run on your local machine
# Exit and move the .env and cookies file to the new instance
# exit
# cd ~/newExtension/api
# scp -i ~/.ssh/ytdlp-api-key.pem .env ubuntu@34.228.156.229:~/yt-dlp-API/
# scp -i ~/.ssh/ytdlp-api-key.pem www.youtube.com_cookies.txt ubuntu@34.228.156.229:~/yt-dlp-API/

# STEP 3: Here those commands should run on the new instance
# SSH into the new instance and Build and run the Docker container
# ssh -i ~/.ssh/ytdlp-api-key.pem ubuntu@34.228.156.229
# cd ~/yt-dlp-API
# docker build -t yt-dlp-api .
# docker run -d -p 80:3000 --restart always --name yt-dlp-api yt-dlp-api
