# VPC with two private subnets (RDS + the App Runner VPC connector) and one public
# subnet carrying a single self-managed NAT instance, so the private subnets have
# outbound internet access — logit-api needs this for the Stripe SDK's calls to
# api.stripe.com, not just for reaching RDS. A t3.micro NAT instance instead of a
# managed NAT Gateway to stay inside AWS Free Tier (~$32-45/mo for a NAT Gateway vs.
# free for 12mo / ~$3-4/mo after on a NAT instance) — the tradeoff is this one instance's
# patching/uptime is now on us instead of AWS. Single instance, no failover; revisit
# alongside the single-AZ RDS tradeoff below if this needs real HA later.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.42.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.project_name}-private-${count.index}"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.42.100.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

resource "aws_eip_association" "nat" {
  instance_id   = aws_instance.nat.id
  allocation_id = aws_eip.nat.id
}

# Free-Tier-eligible Amazon Linux 2023 AMI to run the NAT instance on.
data "aws_ami" "nat" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

resource "aws_security_group" "nat_instance" {
  name        = "${var.project_name}-nat-instance"
  description = "NAT instance: accept all traffic from the private subnets, forward it out"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-nat-instance"
  }
}

resource "aws_instance" "nat" {
  ami                    = data.aws_ami.nat.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.nat_instance.id]
  # Required for a NAT instance: it forwards packets that aren't addressed to itself,
  # which AWS blocks by default as an anti-spoofing measure.
  source_dest_check = false

  user_data = <<-EOF
    #!/bin/bash
    set -eux
    echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-nat.conf
    sysctl -p /etc/sysctl.d/99-nat.conf
    IFACE=$(ip -o -4 route show to default | awk '{print $5}')
    iptables -t nat -A POSTROUTING -o "$IFACE" -j MASQUERADE
    mkdir -p /etc/sysconfig
    iptables-save > /etc/sysconfig/iptables
    cat > /etc/systemd/system/nat-iptables-restore.service <<'UNIT'
    [Unit]
    Description=Restore NAT iptables rules
    After=network.target
    [Service]
    Type=oneshot
    ExecStart=/usr/sbin/iptables-restore /etc/sysconfig/iptables
    RemainAfterExit=yes
    [Install]
    WantedBy=multi-user.target
    UNIT
    systemctl daemon-reload
    systemctl enable nat-iptables-restore.service
  EOF

  tags = {
    Name = "${var.project_name}-nat-instance"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block           = "0.0.0.0/0"
    network_interface_id = aws_instance.nat.primary_network_interface_id
  }

  tags = {
    Name = "${var.project_name}-private"
  }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds"
  description = "Allow Postgres from the App Runner VPC connector only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-rds"
  }
}

resource "aws_security_group" "apprunner_connector" {
  name        = "${var.project_name}-apprunner-connector"
  description = "App Runner VPC connector egress"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-apprunner-connector"
  }
}

resource "aws_security_group_rule" "rds_from_apprunner" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.apprunner_connector.id
}
